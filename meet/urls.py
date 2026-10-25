from django.urls import path
from . import views

urlpatterns = [
    path('api/meet/rooms/', views.api_rooms, name='meet_rooms'),
    path('api/meet/rooms/<str:room_id>/', views.api_room_detail, name='meet_room_detail'),
    path('api/meet/rooms/<str:room_id>/files/', views.api_room_files, name='meet_room_files'),
    path('api/meet/rooms/<str:room_id>/files/<int:file_id>/download/', views.api_room_file_download, name='meet_room_file_download'),
    path('api/meet/rooms/<str:room_id>/end/', views.api_end_room, name='meet_end_room'),
]
