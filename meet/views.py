import hashlib
import json
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse, FileResponse, Http404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from .models import Room, RoomParticipant, RoomFile, RoomMessage


def json_response(data, status=200):
    return JsonResponse(data, status=status, safe=False)


@require_http_methods(["GET", "POST"])
def api_rooms(request):
    """List active rooms or create a new room."""
    if request.method == "GET":
        rooms = Room.objects.filter(is_active=True).select_related('host', 'host__profile').prefetch_related('participants')
        return json_response([r.to_dict(request.user) for r in rooms])

    elif request.method == "POST":
        if not request.user.is_authenticated:
            return json_response({'error': 'Authentication required to host a room.'}, status=401)

        try:
            data = json.loads(request.body.decode('utf-8'))
        except Exception:
            data = {}

        title = data.get('title', '').strip() or f"{request.user.username}'s Space"
        passcode = data.get('passcode', '').strip()
        allow_screen_share = data.get('allow_screen_share', True)
        allow_whiteboard = data.get('allow_whiteboard', True)
        allow_file_share = data.get('allow_file_share', True)

        room = Room.objects.create(
            title=title,
            host=request.user,
            passcode=passcode,
            allow_screen_share=allow_screen_share,
            allow_whiteboard=allow_whiteboard,
            allow_file_share=allow_file_share,
        )

        return json_response(room.to_dict(request.user), status=201)


@require_http_methods(["GET", "POST"])
def api_room_detail(request, room_id):
    """Get room details or verify room passcode."""
    room = get_object_or_404(Room, room_id=room_id, is_active=True)

    if request.method == "POST":
        # Passcode check
        try:
            data = json.loads(request.body.decode('utf-8'))
            entered_passcode = data.get('passcode', '').strip()
        except Exception:
            entered_passcode = ''

        if room.passcode and room.passcode != entered_passcode:
            return json_response({'error': 'Incorrect meeting passcode.'}, status=403)

        return json_response({'success': True, 'room': room.to_dict(request.user)})

    # GET
    res = room.to_dict(request.user)
    # Include files and messages
    res['files'] = [f.to_dict() for f in room.files.all()[:30]]
    res['messages'] = [m.to_dict() for m in room.messages.all()[:50]]
    return json_response(res)


@require_http_methods(["GET", "POST"])
def api_room_files(request, room_id):
    """List or upload files for a specific room."""
    room = get_object_or_404(Room, room_id=room_id, is_active=True)

    if request.method == "GET":
        files = room.files.select_related('sender', 'sender__profile').all()
        return json_response([f.to_dict() for f in files])

    elif request.method == "POST":
        if not request.user.is_authenticated:
            return json_response({'error': 'Authentication required to share files.'}, status=401)

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return json_response({'error': 'No file uploaded.'}, status=400)

        # Compute SHA-256 checksum for integrity & data encryption verification
        hasher = hashlib.sha256()
        for chunk in uploaded_file.chunks():
            hasher.update(chunk)
        checksum = hasher.hexdigest()

        room_file = RoomFile.objects.create(
            room=room,
            sender=request.user,
            file=uploaded_file,
            filename=uploaded_file.name,
            file_size=uploaded_file.size,
            file_type=uploaded_file.content_type or 'application/octet-stream',
            checksum=checksum,
        )

        return json_response(room_file.to_dict(), status=201)


@require_http_methods(["GET"])
def api_room_file_download(request, room_id, file_id):
    """Download a shared file."""
    room = get_object_or_404(Room, room_id=room_id)
    room_file = get_object_or_404(RoomFile, id=file_id, room=room)

    try:
        response = FileResponse(room_file.file.open('rb'), content_type=room_file.file_type)
        response['Content-Disposition'] = f'attachment; filename="{room_file.filename}"'
        return response
    except Exception:
        raise Http404("File not found on server.")


@require_http_methods(["POST"])
def api_end_room(request, room_id):
    """Host can end/archive a collaboration room."""
    if not request.user.is_authenticated:
        return json_response({'error': 'Authentication required.'}, status=401)

    room = get_object_or_404(Room, room_id=room_id, host=request.user)
    room.is_active = False
    room.save(update_fields=['is_active'])
    return json_response({'success': True, 'message': 'Room concluded.'})
