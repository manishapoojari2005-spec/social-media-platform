from django.urls import path
from . import views

urlpatterns = [
    # SPA HTML View
    path('', views.index, name='index'),

    # Auth & Current User
    path('api/auth/me/', views.api_me, name='api_me'),
    path('api/auth/login/', views.api_login, name='api_login'),
    path('api/auth/register/', views.api_register, name='api_register'),
    path('api/auth/logout/', views.api_logout, name='api_logout'),
    path('api/auth/switch-user/', views.api_switch_user, name='api_switch_user'),
    path('api/users/demo/', views.api_demo_users, name='api_demo_users'),

    # Posts & Interactions
    path('api/posts/', views.api_posts, name='api_posts'),
    path('api/posts/<int:post_id>/', views.api_post_detail, name='api_post_detail'),
    path('api/posts/<int:post_id>/like/', views.api_toggle_like, name='api_toggle_like'),
    path('api/posts/<int:post_id>/comments/', views.api_post_comments, name='api_post_comments'),
    path('api/comments/<int:comment_id>/', views.api_delete_comment, name='api_delete_comment'),

    # Profiles & Follow
    path('api/users/profile/', views.api_update_profile, name='api_update_profile'),
    path('api/users/suggestions/', views.api_user_suggestions, name='api_user_suggestions'),
    path('api/users/<str:username>/', views.api_user_profile, name='api_user_profile'),
    path('api/users/<str:username>/follow/', views.api_toggle_follow, name='api_toggle_follow'),
]
