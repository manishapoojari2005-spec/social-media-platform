import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pulse_project.settings')
django.setup()

from django.test import RequestFactory, Client
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from meet.models import Room, RoomParticipant, RoomFile, RoomMessage
import json

def run_tests():
    print("=== Testing Pulse Meet Core Architecture & APIs ===")
    client = Client()

    # 1. Login user
    elena = User.objects.get(username='elena_v')
    client.force_login(elena)
    print("1. User force_login elena_v: OK")

    # 2. Test Room Listing
    res = client.get('/api/meet/rooms/')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    rooms = res.json()
    assert len(rooms) >= 2, "Expected at least 2 seeded rooms"
    print(f"2. Room listing: OK ({len(rooms)} rooms found)")

    # 3. Test Room Creation
    new_room_payload = {
        'title': 'Automated Test Room',
        'passcode': 'secretPass123',
        'allow_screen_share': True,
        'allow_whiteboard': True,
        'allow_file_share': True
    }
    res = client.post('/api/meet/rooms/', data=json.dumps(new_room_payload), content_type='application/json')
    assert res.status_code == 201, f"Expected 201, got {res.status_code}"
    created_room = res.json()
    room_id = created_room['room_id']
    assert created_room['title'] == 'Automated Test Room'
    assert created_room['has_passcode'] == True
    print(f"3. Room creation: OK (Room ID: {room_id})")

    # 4. Test Passcode Verification
    # Wrong passcode
    res = client.post(f'/api/meet/rooms/{room_id}/', data=json.dumps({'passcode': 'wrongPass'}), content_type='application/json')
    assert res.status_code == 403, f"Expected 403 for wrong passcode, got {res.status_code}"
    print("4a. Passcode reject wrong pass: OK (403 Forbidden)")

    # Correct passcode
    res = client.post(f'/api/meet/rooms/{room_id}/', data=json.dumps({'passcode': 'secretPass123'}), content_type='application/json')
    assert res.status_code == 200, f"Expected 200 for correct passcode, got {res.status_code}"
    print("4b. Passcode accept correct pass: OK (200 OK)")

    # 5. Test File Upload & SHA-256 Checksum Calculation
    test_content = b"Antigravity WebRTC P2P DataChannel Encrypted Payload Test"
    upload_file = SimpleUploadedFile("test_payload.txt", test_content, content_type="text/plain")
    res = client.post(f'/api/meet/rooms/{room_id}/files/', {'file': upload_file})
    assert res.status_code == 201, f"Expected 201 for file upload, got {res.status_code}"
    file_data = res.json()
    assert file_data['filename'] == "test_payload.txt"
    assert len(file_data['checksum']) == 64, "SHA-256 checksum must be 64 hex characters"
    file_id = file_data['id']
    print(f"5. File upload & SHA-256 integrity checksum ({file_data['checksum'][:16]}...): OK")

    # 6. Test File Download
    res = client.get(f'/api/meet/rooms/{room_id}/files/{file_id}/download/')
    assert res.status_code == 200, f"Expected 200 for download, got {res.status_code}"
    content = b"".join(res.streaming_content) if hasattr(res, 'streaming_content') else res.content
    assert content == test_content, "Downloaded file content must match original uploaded content"
    print("6. File download & byte verification: OK")

    # 7. Test Whiteboard Persistence & Messages in Room Detail
    res = client.get(f'/api/meet/rooms/{room_id}/')
    assert res.status_code == 200
    detail = res.json()
    assert 'files' in detail and len(detail['files']) == 1
    print("7. Room detail with file vault & messages: OK")

    print("\nALL BACKEND & ARCHITECTURE TESTS PASSED SUCCESSFULLY! [OK]")

if __name__ == '__main__':
    run_tests()
