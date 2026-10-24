import json
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponseForbidden, HttpResponseNotFound
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Q
from .models import UserProfile, Post, Comment, Like, Follow


@ensure_csrf_cookie
def index(request):
    """Renders the single-page application shell."""
    return render(request, 'index.html')


def parse_json(request):
    try:
        return json.loads(request.body.decode('utf-8'))
    except Exception:
        return {}


def api_me(request):
    if not request.user.is_authenticated:
        return JsonResponse({'authenticated': False, 'user': None})
    
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    return JsonResponse({
        'authenticated': True,
        'user': profile.to_dict(current_user=request.user)
    })


@csrf_exempt
@require_http_methods(["POST"])
def api_login(request):
    data = parse_json(request)
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return JsonResponse({'error': 'Username and password are required.'}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is not None:
        login(request, user)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return JsonResponse({
            'success': True,
            'message': f'Welcome back, {profile.name}!',
            'user': profile.to_dict(current_user=user)
        })
    else:
        return JsonResponse({'error': 'Invalid username or password.'}, status=401)


@csrf_exempt
@require_http_methods(["POST"])
def api_register(request):
    data = parse_json(request)
    username = data.get('username', '').strip().lower()
    display_name = data.get('display_name', '').strip() or username
    password = data.get('password', '').strip()
    bio = data.get('bio', '').strip()
    avatar = data.get('avatar', '').strip()

    if not username or not password:
        return JsonResponse({'error': 'Username and password are required.'}, status=400)

    if len(username) < 3:
        return JsonResponse({'error': 'Username must be at least 3 characters.'}, status=400)

    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({'error': 'Username is already taken.'}, status=400)

    user = User.objects.create_user(username=username, password=password)
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.display_name = display_name
    profile.bio = bio
    if avatar:
        profile.avatar = avatar
    else:
        profile.avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={username}"
    profile.save()

    login(request, user)
    return JsonResponse({
        'success': True,
        'message': 'Account created successfully!',
        'user': profile.to_dict(current_user=user)
    })


@csrf_exempt
@require_http_methods(["POST"])
def api_logout(request):
    logout(request)
    return JsonResponse({'success': True, 'message': 'Logged out successfully.'})


@csrf_exempt
@require_http_methods(["POST"])
def api_switch_user(request):
    """Convenience endpoint to seamlessly switch between seeded demo users for testing social features."""
    data = parse_json(request)
    username = data.get('username', '').strip()
    try:
        user = User.objects.get(username__iexact=username)
        login(request, user)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return JsonResponse({
            'success': True,
            'message': f'Switched to @{user.username}',
            'user': profile.to_dict(current_user=user)
        })
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)


def api_demo_users(request):
    users = User.objects.all().order_by('id')[:8]
    result = []
    for u in users:
        p, _ = UserProfile.objects.get_or_create(user=u)
        result.append({
            'id': u.id,
            'username': u.username,
            'display_name': p.name,
            'avatar': p.avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={u.username}",
            'bio': p.bio,
            'is_current': (request.user.is_authenticated and request.user.id == u.id)
        })
    return JsonResponse({'users': result})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_posts(request):
    if request.method == "GET":
        feed_filter = request.GET.get('filter', 'for_you')
        username = request.GET.get('username', '').strip()
        tag = request.GET.get('tag', '').strip()
        search_query = request.GET.get('search', '').strip()

        queryset = Post.objects.select_related('author', 'author__profile').prefetch_related('likes', 'comments').all()

        if username:
            queryset = queryset.filter(author__username__iexact=username)
        elif feed_filter == 'following':
            if request.user.is_authenticated:
                following_ids = Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
                # Show posts from followed users and self
                queryset = queryset.filter(Q(author_id__in=following_ids) | Q(author=request.user))
            else:
                queryset = Post.objects.none()

        if tag:
            clean_tag = tag.lstrip('#')
            queryset = queryset.filter(Q(tag__iexact=clean_tag) | Q(content__icontains=f"#{clean_tag}"))

        if search_query:
            queryset = queryset.filter(
                Q(content__icontains=search_query) |
                Q(author__username__icontains=search_query) |
                Q(author__profile__display_name__icontains=search_query) |
                Q(tag__icontains=search_query)
            )

        posts_data = [p.to_dict(current_user=request.user) for p in queryset[:50]]
        return JsonResponse({'posts': posts_data})

    elif request.method == "POST":
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'You must be logged in to create a post.'}, status=401)

        data = parse_json(request)
        content = data.get('content', '').strip()
        image_url = data.get('image_url', '').strip()
        tag = data.get('tag', '').strip().lstrip('#')

        if not content and not image_url:
            return JsonResponse({'error': 'Post content or image is required.'}, status=400)

        post = Post.objects.create(
            author=request.user,
            content=content,
            image_url=image_url,
            tag=tag
        )

        return JsonResponse({
            'success': True,
            'message': 'Post created successfully!',
            'post': post.to_dict(current_user=request.user)
        }, status=201)


@csrf_exempt
@require_http_methods(["GET", "DELETE"])
def api_post_detail(request, post_id):
    post = get_object_or_404(Post, id=post_id)

    if request.method == "GET":
        return JsonResponse({'post': post.to_dict(current_user=request.user)})

    elif request.method == "DELETE":
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required.'}, status=401)
        if post.author != request.user:
            return JsonResponse({'error': 'Permission denied. Only author can delete this post.'}, status=403)
        
        post.delete()
        return JsonResponse({'success': True, 'message': 'Post deleted.'})


@csrf_exempt
@require_http_methods(["POST"])
def api_toggle_like(request, post_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required to like posts.'}, status=401)

    post = get_object_or_404(Post, id=post_id)
    like = Like.objects.filter(post=post, user=request.user).first()

    if like:
        like.delete()
        liked = False
    else:
        Like.objects.create(post=post, user=request.user)
        liked = True

    return JsonResponse({
        'success': True,
        'liked': liked,
        'likes_count': post.likes.count()
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_post_comments(request, post_id):
    post = get_object_or_404(Post, id=post_id)

    if request.method == "GET":
        comments = post.comments.select_related('author', 'author__profile').all()
        comments_data = [c.to_dict(current_user=request.user) for c in comments]
        return JsonResponse({'comments': comments_data})

    elif request.method == "POST":
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required to comment.'}, status=401)

        data = parse_json(request)
        content = data.get('content', '').strip()

        if not content:
            return JsonResponse({'error': 'Comment content cannot be empty.'}, status=400)

        comment = Comment.objects.create(
            post=post,
            author=request.user,
            content=content
        )

        return JsonResponse({
            'success': True,
            'message': 'Comment added.',
            'comment': comment.to_dict(current_user=request.user),
            'comments_count': post.comments.count()
        }, status=201)


@csrf_exempt
@require_http_methods(["DELETE"])
def api_delete_comment(request, comment_id):
    comment = get_object_or_404(Comment, id=comment_id)
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required.'}, status=401)

    if comment.author != request.user and comment.post.author != request.user:
        return JsonResponse({'error': 'Permission denied.'}, status=403)

    post_id = comment.post.id
    comment.delete()
    remaining_count = Comment.objects.filter(post_id=post_id).count()

    return JsonResponse({
        'success': True,
        'message': 'Comment deleted.',
        'comments_count': remaining_count
    })


@require_http_methods(["GET"])
def api_user_profile(request, username):
    user = get_object_or_404(User, username__iexact=username)
    profile, _ = UserProfile.objects.get_or_create(user=user)

    posts = Post.objects.filter(author=user).select_related('author', 'author__profile').prefetch_related('likes', 'comments')
    posts_data = [p.to_dict(current_user=request.user) for p in posts]

    liked_posts = Post.objects.filter(likes__user=user).select_related('author', 'author__profile').prefetch_related('likes', 'comments')
    liked_posts_data = [p.to_dict(current_user=request.user) for p in liked_posts]

    return JsonResponse({
        'profile': profile.to_dict(current_user=request.user),
        'posts': posts_data,
        'liked_posts': liked_posts_data
    })


@csrf_exempt
@require_http_methods(["PUT", "POST"])
def api_update_profile(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required.'}, status=401)

    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    data = parse_json(request)

    display_name = data.get('display_name', '').strip()
    bio = data.get('bio', '').strip()
    avatar = data.get('avatar', '').strip()
    cover_image = data.get('cover_image', '').strip()
    location = data.get('location', '').strip()
    website = data.get('website', '').strip()

    if display_name:
        profile.display_name = display_name
    profile.bio = bio
    if avatar:
        profile.avatar = avatar
    if cover_image:
        profile.cover_image = cover_image
    profile.location = location
    profile.website = website
    profile.save()

    return JsonResponse({
        'success': True,
        'message': 'Profile updated successfully!',
        'user': profile.to_dict(current_user=request.user)
    })


@csrf_exempt
@require_http_methods(["POST"])
def api_toggle_follow(request, username):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required to follow users.'}, status=401)

    target_user = get_object_or_404(User, username__iexact=username)
    if target_user == request.user:
        return JsonResponse({'error': 'You cannot follow yourself.'}, status=400)

    follow = Follow.objects.filter(follower=request.user, following=target_user).first()
    if follow:
        follow.delete()
        following = False
    else:
        Follow.objects.create(follower=request.user, following=target_user)
        following = True

    followers_count = Follow.objects.filter(following=target_user).count()

    return JsonResponse({
        'success': True,
        'following': following,
        'followers_count': followers_count
    })


def api_user_suggestions(request):
    """Return suggested users to follow (excluding current user and already followed users if authenticated)."""
    queryset = User.objects.all()
    if request.user.is_authenticated:
        following_ids = Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
        queryset = queryset.exclude(id__in=list(following_ids) + [request.user.id])
    
    users = queryset[:6]
    suggestions = []
    for u in users:
        p, _ = UserProfile.objects.get_or_create(user=u)
        suggestions.append({
            'id': u.id,
            'username': u.username,
            'display_name': p.name,
            'avatar': p.avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={u.username}",
            'bio': p.bio,
            'followers_count': Follow.objects.filter(following=u).count(),
        })

    return JsonResponse({'suggestions': suggestions})
