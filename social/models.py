from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    display_name = models.CharField(max_length=80, blank=True)
    bio = models.TextField(max_length=300, blank=True)
    avatar = models.URLField(max_length=500, blank=True, default='')
    cover_image = models.URLField(max_length=500, blank=True, default='')
    location = models.CharField(max_length=100, blank=True)
    website = models.URLField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

    @property
    def name(self):
        return self.display_name or self.user.username

    def to_dict(self, current_user=None):
        followers_count = Follow.objects.filter(following=self.user).count()
        following_count = Follow.objects.filter(follower=self.user).count()
        posts_count = Post.objects.filter(author=self.user).count()
        is_following = False
        is_self = False

        if current_user and current_user.is_authenticated:
            is_self = (current_user.id == self.user.id)
            if not is_self:
                is_following = Follow.objects.filter(follower=current_user, following=self.user).exists()

        return {
            'id': self.user.id,
            'username': self.user.username,
            'display_name': self.name,
            'bio': self.bio,
            'avatar': self.avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={self.user.username}",
            'cover_image': self.cover_image or "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80",
            'location': self.location,
            'website': self.website,
            'created_at': self.created_at.strftime('%B %Y') if self.created_at else '',
            'followers_count': followers_count,
            'following_count': following_count,
            'posts_count': posts_count,
            'is_following': is_following,
            'is_self': is_self,
        }


@receiver(post_save, sender=User)
def create_or_save_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance, display_name=instance.username)
    else:
        if hasattr(instance, 'profile'):
            instance.profile.save()


class Post(models.Model):
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='posts')
    content = models.TextField(max_length=2000)
    image_url = models.URLField(max_length=500, blank=True, default='')
    tag = models.CharField(max_length=50, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Post by {self.author.username} at {self.created_at}"

    def to_dict(self, current_user=None):
        likes_count = self.likes.count()
        comments_count = self.comments.count()
        is_liked = False
        is_author = False

        if current_user and current_user.is_authenticated:
            is_liked = self.likes.filter(user=current_user).exists()
            is_author = (current_user.id == self.author.id)

        author_profile = getattr(self.author, 'profile', None)
        author_avatar = author_profile.avatar if author_profile and author_profile.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={self.author.username}"
        author_name = author_profile.name if author_profile else self.author.username

        is_author_followed = False
        if current_user and current_user.is_authenticated and not is_author:
            is_author_followed = Follow.objects.filter(follower=current_user, following=self.author).exists()

        return {
            'id': self.id,
            'content': self.content,
            'image_url': self.image_url,
            'tag': self.tag,
            'created_at': self.created_at.isoformat(),
            'author': {
                'id': self.author.id,
                'username': self.author.username,
                'display_name': author_name,
                'avatar': author_avatar,
                'is_followed': is_author_followed,
            },
            'likes_count': likes_count,
            'comments_count': comments_count,
            'is_liked': is_liked,
            'is_author': is_author,
        }


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    content = models.TextField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author.username} on {self.post.id}"

    def to_dict(self, current_user=None):
        is_author = False
        if current_user and current_user.is_authenticated:
            is_author = (current_user.id == self.author.id)

        author_profile = getattr(self.author, 'profile', None)
        author_avatar = author_profile.avatar if author_profile and author_profile.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={self.author.username}"
        author_name = author_profile.name if author_profile else self.author.username

        return {
            'id': self.id,
            'post_id': self.post.id,
            'content': self.content,
            'created_at': self.created_at.isoformat(),
            'author': {
                'id': self.author.id,
                'username': self.author.username,
                'display_name': author_name,
                'avatar': author_avatar,
            },
            'is_author': is_author,
        }


class Like(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='post_likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('post', 'user')

    def __str__(self):
        return f"{self.user.username} liked Post {self.post.id}"


class Follow(models.Model):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name='following_set')
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name='follower_set')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('follower', 'following')

    def __str__(self):
        return f"{self.follower.username} follows {self.following.username}"
