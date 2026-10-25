import json
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from meet.models import Room, RoomParticipant, RoomMessage


class Command(BaseCommand):
    help = 'Seeds initial collaboration rooms for Pulse Meet'

    def handle(self, *args, **options):
        self.stdout.write("Seeding Pulse Meet demo rooms...")

        elena = User.objects.filter(username='elena_v').first()
        alex = User.objects.filter(username='alex_dev').first()
        maya = User.objects.filter(username='maya_design').first()
        sophia = User.objects.filter(username='sophia_ai').first()

        if not elena or not alex:
            self.stdout.write("Users not found, please run python manage.py seed_data first.")
            return

        # Room 1: Design Systems & Spatial UI
        demo_wb_1 = [
            {
                'type': 'freehand',
                'color': '#6366f1',
                'size': 4,
                'points': [{'x': 120, 'y': 150}, {'x': 180, 'y': 160}, {'x': 250, 'y': 150}, {'x': 320, 'y': 180}],
            },
            {
                'type': 'shape',
                'shape': 'rect',
                'color': '#06b6d4',
                'size': 3,
                'x1': 100,
                'y1': 220,
                'x2': 280,
                'y2': 340,
            },
            {
                'type': 'text',
                'color': '#ec4899',
                'size': 20,
                'x': 120,
                'y': 280,
                'text': 'Design Token Spec v2.0',
            },
            {
                'type': 'shape',
                'shape': 'arrow',
                'color': '#10b981',
                'size': 3,
                'x1': 280,
                'y1': 280,
                'x2': 420,
                'y2': 280,
            },
            {
                'type': 'shape',
                'shape': 'circle',
                'color': '#f59e0b',
                'size': 3,
                'x1': 420,
                'y1': 220,
                'x2': 560,
                'y2': 340,
            },
            {
                'type': 'text',
                'color': '#e2e8f0',
                'size': 18,
                'x': 440,
                'y': 280,
                'text': 'WebRTC Mesh',
            }
        ]

        room1, created1 = Room.objects.get_or_create(
            room_id='design-sync',
            defaults={
                'title': 'Design Systems & Spatial UI Review',
                'host': elena,
                'passcode': '',
                'is_locked': False,
                'allow_screen_share': True,
                'allow_whiteboard': True,
                'allow_file_share': True,
                'whiteboard_data': json.dumps(demo_wb_1),
            }
        )

        RoomParticipant.objects.get_or_create(room=room1, user=elena, defaults={'is_active': True})
        if maya:
            RoomParticipant.objects.get_or_create(room=room1, user=maya, defaults={'is_active': True})

        RoomMessage.objects.get_or_create(
            room=room1,
            sender=elena,
            text='Welcome to the spatial UI sprint! Feel free to sketch concepts on the whiteboard.',
            defaults={'is_encrypted': False}
        )

        # Room 2: High-Performance Systems & WebRTC Architecture
        room2, created2 = Room.objects.get_or_create(
            room_id='systems-hub',
            defaults={
                'title': 'WebRTC Signaling & Media Pipeline Sync',
                'host': alex,
                'passcode': 'dev123',
                'is_locked': False,
                'allow_screen_share': True,
                'allow_whiteboard': True,
                'allow_file_share': True,
                'whiteboard_data': '[]',
            }
        )

        RoomParticipant.objects.get_or_create(room=room2, user=alex, defaults={'is_active': True})
        if sophia:
            RoomParticipant.objects.get_or_create(room=room2, user=sophia, defaults={'is_active': True})

        RoomMessage.objects.get_or_create(
            room=room2,
            sender=alex,
            text='Testing full mesh P2P DataChannels and DTLS/SRTP encryption. Room is passcode protected (dev123).',
            defaults={'is_encrypted': True}
        )

        self.stdout.write(self.style.SUCCESS("Successfully seeded Pulse Meet demo rooms!"))
