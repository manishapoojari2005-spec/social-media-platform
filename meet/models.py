import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


def generate_room_code():
    return uuid.uuid4().hex[:8]


class Room(models.Model):
    room_id = models.CharField(max_length=64, unique=True, default=generate_room_code, db_index=True)
    title = models.CharField(max_length=150, default='Pulse Collaboration Space')
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hosted_rooms')
    passcode = models.CharField(max_length=128, blank=True, default='', help_text='Optional room passcode')
    is_locked = models.BooleanField(default=False, help_text='Locked rooms require host admission')
    allow_screen_share = models.BooleanField(default=True)
    allow_whiteboard = models.BooleanField(default=True)
    allow_file_share = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    whiteboard_data = models.TextField(blank=True, default='[]', help_text='Serialized JSON of whiteboard strokes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.room_id})"

    def active_participants_count(self):
        return self.participants.filter(is_active=True).count()

    def to_dict(self, current_user=None):
        host_profile = getattr(self.host, 'profile', None)
        host_avatar = host_profile.avatar if host_profile and host_profile.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={self.host.username}"
        host_name = host_profile.name if host_profile else self.host.username

        active_users = []
        for p in self.participants.filter(is_active=True).select_related('user', 'user__profile'):
            u = p.user
            prof = getattr(u, 'profile', None)
            active_users.append({
                'id': u.id,
                'username': u.username,
                'display_name': prof.name if prof else u.username,
                'avatar': prof.avatar if prof and prof.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={u.username}",
                'is_host': (u.id == self.host.id),
            })

        is_host = False
        if current_user and current_user.is_authenticated:
            is_host = (current_user.id == self.host.id)

        return {
            'room_id': self.room_id,
            'title': self.title,
            'host': {
                'id': self.host.id,
                'username': self.host.username,
                'display_name': host_name,
                'avatar': host_avatar,
            },
            'has_passcode': bool(self.passcode),
            'is_locked': self.is_locked,
            'allow_screen_share': self.allow_screen_share,
            'allow_whiteboard': self.allow_whiteboard,
            'allow_file_share': self.allow_file_share,
            'is_active': self.is_active,
            'participants_count': len(active_users),
            'participants': active_users,
            'is_host': is_host,
            'created_at': self.created_at.strftime('%b %d, %H:%M'),
        }


class RoomParticipant(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='room_participations')
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('room', 'user')

    def __str__(self):
        return f"{self.user.username} in {self.room.room_id}"


class RoomFile(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='files')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='room_files')
    file = models.FileField(upload_to='meet_files/%Y/%m/')
    filename = models.CharField(max_length=255)
    file_size = models.BigIntegerField(default=0)
    file_type = models.CharField(max_length=100, blank=True, default='')
    checksum = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def to_dict(self):
        prof = getattr(self.sender, 'profile', None)
        return {
            'id': self.id,
            'filename': self.filename,
            'file_url': self.file.url if self.file else '',
            'file_size': self.file_size,
            'file_type': self.file_type,
            'checksum': self.checksum,
            'sender': {
                'id': self.sender.id,
                'username': self.sender.username,
                'display_name': prof.name if prof else self.sender.username,
                'avatar': prof.avatar if prof and prof.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={self.sender.username}",
            },
            'created_at': self.created_at.strftime('%H:%M'),
        }


class RoomMessage(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='room_messages')
    text = models.TextField()
    is_encrypted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def to_dict(self):
        prof = getattr(self.sender, 'profile', None)
        return {
            'id': self.id,
            'text': self.text,
            'is_encrypted': self.is_encrypted,
            'sender': {
                'id': self.sender.id,
                'username': self.sender.username,
                'display_name': prof.name if prof else self.sender.username,
                'avatar': prof.avatar if prof and prof.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={self.sender.username}",
            },
            'timestamp': self.created_at.strftime('%H:%M'),
        }
