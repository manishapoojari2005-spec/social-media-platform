from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/meet/(?P<room_id>[a-zA-Z0-9_\-]+)/$', consumers.MeetConsumer.as_asgi()),
]
