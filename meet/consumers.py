import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from .models import Room, RoomParticipant, RoomMessage

logger = logging.getLogger(__name__)


class MeetConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'meet_{self.room_id}'
        self.user = self.scope.get('user')

        # Allow authenticated users (or fallback to session-based identity)
        if not self.user or not self.user.is_authenticated:
            # Reject unauthenticated connections if required
            await self.close(code=4001)
            return

        # Add to room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name') and self.user and self.user.is_authenticated:
            # Mark user inactive in room
            await self.set_participant_inactive(self.room_id, self.user)

            # Broadcast user-left to peers
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'user-left',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                    'username': self.user.username,
                }
            )

            # Leave room group
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except Exception:
            return

        action = data.get('action')
        target_channel = data.get('target_channel')

        # User Join Flow
        if action == 'join':
            # Check room access and passcode if needed
            room_info = await self.register_participant(self.room_id, self.user)
            if not room_info:
                await self.send(text_data=json.dumps({
                    'event': 'error',
                    'message': 'Room not found or access denied.'
                }))
                await self.close()
                return

            # Fetch active peers in room
            peers = await self.get_active_peers(self.room_id, self.user.id)
            user_profile_data = await self.get_user_info(self.user)

            # Send room init data to the joiner
            await self.send(text_data=json.dumps({
                'event': 'room-joined',
                'my_channel': self.channel_name,
                'my_user': user_profile_data,
                'room': room_info,
                'peers': peers,
                'whiteboard_data': room_info.get('whiteboard_data', '[]')
            }))

            # Announce to everyone else that a new peer joined
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'user-joined',
                    'sender_channel': self.channel_name,
                    'user': user_profile_data,
                }
            )

        # WebRTC Signaling (Offer, Answer, ICE Candidate)
        elif action in ['signal-offer', 'signal-answer', 'signal-candidate']:
            payload = {
                'type': 'meet_event',
                'event': action,
                'sender_channel': self.channel_name,
                'target_channel': target_channel,
                'user_id': self.user.id,
                'username': self.user.username,
                'signal_data': data.get('signal_data'),
            }
            if target_channel:
                await self.channel_layer.send(target_channel, payload)
            else:
                await self.channel_layer.group_send(self.room_group_name, payload)

        # Media Status Toggles (Mute Mic, Camera Off, Screen Share On/Off)
        elif action == 'media-status':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'media-status',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                    'is_audio_muted': data.get('is_audio_muted'),
                    'is_video_off': data.get('is_video_off'),
                    'is_screen_sharing': data.get('is_screen_sharing'),
                }
            )

        # Active Speaker Indicator (Volume detected above threshold)
        elif action == 'speaker-active':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'speaker-active',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                    'is_speaking': data.get('is_speaking', False),
                }
            )

        # Collaborative Whiteboard Synchronization
        elif action == 'whiteboard-stroke':
            # Broadcast stroke drawing to other participants
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'whiteboard-stroke',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                    'stroke': data.get('stroke'),
                }
            )

        elif action == 'whiteboard-clear':
            await self.save_whiteboard_data(self.room_id, '[]')
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'whiteboard-clear',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                }
            )

        elif action == 'whiteboard-undo':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'whiteboard-undo',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                }
            )

        elif action == 'whiteboard-cursor':
            # Broadcast live mouse position on the whiteboard
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'whiteboard-cursor',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                    'username': self.user.username,
                    'x': data.get('x'),
                    'y': data.get('y'),
                }
            )

        elif action == 'whiteboard-save':
            wb_state = data.get('whiteboard_data')
            if wb_state is not None:
                await self.save_whiteboard_data(self.room_id, json.dumps(wb_state))

        # Real-time In-Call Chat
        elif action == 'chat-message':
            text = data.get('text', '').strip()
            is_encrypted = data.get('is_encrypted', False)
            if text:
                msg_obj = await self.save_chat_message(self.room_id, self.user, text, is_encrypted)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'meet_event',
                        'event': 'chat-message',
                        'sender_channel': self.channel_name,
                        'message': msg_obj,
                    }
                )

        # Real-time Reaction Bursts
        elif action == 'reaction':
            emoji = data.get('emoji', '👍')
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'meet_event',
                    'event': 'reaction',
                    'sender_channel': self.channel_name,
                    'user_id': self.user.id,
                    'username': self.user.username,
                    'emoji': emoji,
                }
            )

        # Host Controls: Kick Participant, Mute All, Lock Room
        elif action == 'kick-user':
            is_host = await self.check_is_host(self.room_id, self.user)
            target_user_id = data.get('target_user_id')
            if is_host and target_user_id:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'meet_event',
                        'event': 'kicked',
                        'target_user_id': target_user_id,
                        'reason': 'The host removed you from the meeting.'
                    }
                )

        elif action == 'mute-all':
            is_host = await self.check_is_host(self.room_id, self.user)
            if is_host:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'meet_event',
                        'event': 'host-muted-all',
                        'sender_channel': self.channel_name,
                    }
                )

        elif action == 'toggle-lock':
            is_host = await self.check_is_host(self.room_id, self.user)
            if is_host:
                new_state = await self.toggle_room_lock(self.room_id)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'meet_event',
                        'event': 'room-lock-changed',
                        'is_locked': new_state,
                    }
                )

    async def meet_event(self, event):
        # Don't echo events back to the sender if requested (except for explicit broadcast)
        sender_channel = event.get('sender_channel')
        event_name = event.get('event')

        # For stroke and cursor, omit sending back to sender
        if sender_channel == self.channel_name and event_name in ['whiteboard-stroke', 'whiteboard-cursor', 'whiteboard-undo']:
            return

        # Targetted signal handling
        target_channel = event.get('target_channel')
        if target_channel and target_channel != self.channel_name:
            return

        # Handle kick
        if event_name == 'kicked' and event.get('target_user_id') == self.user.id:
            await self.send(text_data=json.dumps({
                'event': 'kicked',
                'reason': event.get('reason', 'Removed by host')
            }))
            await self.close(code=4003)
            return

        # Forward event to client
        await self.send(text_data=json.dumps(event))

    # --- Database Helpers ---

    @database_sync_to_async
    def register_participant(self, room_id, user):
        try:
            room = Room.objects.get(room_id=room_id, is_active=True)
            participant, _ = RoomParticipant.objects.get_or_create(room=room, user=user)
            participant.is_active = True
            participant.joined_at = timezone.now()
            participant.left_at = None
            participant.save()

            return {
                'room_id': room.room_id,
                'title': room.title,
                'is_host': (room.host_id == user.id),
                'is_locked': room.is_locked,
                'allow_screen_share': room.allow_screen_share,
                'allow_whiteboard': room.allow_whiteboard,
                'allow_file_share': room.allow_file_share,
                'whiteboard_data': room.whiteboard_data,
            }
        except Room.DoesNotExist:
            return None

    @database_sync_to_async
    def set_participant_inactive(self, room_id, user):
        try:
            room = Room.objects.get(room_id=room_id)
            RoomParticipant.objects.filter(room=room, user=user).update(
                is_active=False,
                left_at=timezone.now()
            )
        except Room.DoesNotExist:
            pass

    @database_sync_to_async
    def get_active_peers(self, room_id, exclude_user_id):
        try:
            room = Room.objects.get(room_id=room_id)
            participants = RoomParticipant.objects.filter(
                room=room,
                is_active=True
            ).exclude(user_id=exclude_user_id).select_related('user', 'user__profile')

            peer_list = []
            for p in participants:
                u = p.user
                prof = getattr(u, 'profile', None)
                peer_list.append({
                    'id': u.id,
                    'username': u.username,
                    'display_name': prof.name if prof else u.username,
                    'avatar': prof.avatar if prof and prof.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={u.username}",
                    'is_host': (u.id == room.host_id),
                })
            return peer_list
        except Room.DoesNotExist:
            return []

    @database_sync_to_async
    def get_user_info(self, user):
        prof = getattr(user, 'profile', None)
        return {
            'id': user.id,
            'username': user.username,
            'display_name': prof.name if prof else user.username,
            'avatar': prof.avatar if prof and prof.avatar else f"https://api.dicebear.com/7.x/bottts/svg?seed={user.username}",
        }

    @database_sync_to_async
    def save_whiteboard_data(self, room_id, data_str):
        Room.objects.filter(room_id=room_id).update(whiteboard_data=data_str)

    @database_sync_to_async
    def save_chat_message(self, room_id, user, text, is_encrypted):
        room = Room.objects.get(room_id=room_id)
        msg = RoomMessage.objects.create(
            room=room,
            sender=user,
            text=text,
            is_encrypted=is_encrypted
        )
        return msg.to_dict()

    @database_sync_to_async
    def check_is_host(self, room_id, user):
        return Room.objects.filter(room_id=room_id, host=user).exists()

    @database_sync_to_async
    def toggle_room_lock(self, room_id):
        try:
            room = Room.objects.get(room_id=room_id)
            room.is_locked = not room.is_locked
            room.save(update_fields=['is_locked'])
            return room.is_locked
        except Room.DoesNotExist:
            return False
