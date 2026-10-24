import urllib.request
import urllib.parse
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE = "http://127.0.0.1:8000"

def get(path):
    req = urllib.request.Request(BASE + path)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def run_tests():
    print("--- 1. Testing GET /api/posts/ ---")
    data = get("/api/posts/")
    posts = data.get("posts", [])
    print(f"Loaded {len(posts)} posts successfully.")
    assert len(posts) > 0, "No posts returned!"

    first_post = posts[0]
    print(f"Sample Post by @{first_post['author']['username']}: {first_post['content'][:60]}...")
    print(f"Likes: {first_post['likes_count']}, Comments: {first_post['comments_count']}")

    print("\n--- 2. Testing GET /api/users/demo/ ---")
    demo_data = get("/api/users/demo/")
    users = demo_data.get("users", [])
    print(f"Loaded {len(users)} demo users: {[u['username'] for u in users]}")
    assert len(users) >= 5, "Demo users missing!"

    print("\n--- 3. Testing GET /api/users/elena_v/ ---")
    profile_data = get("/api/users/elena_v/")
    p = profile_data["profile"]
    print(f"Profile: {p['display_name']} (@{p['username']})")
    print(f"Bio: {p['bio'][:50]}...")
    print(f"Followers: {p['followers_count']}, Following: {p['following_count']}, Pulses: {p['posts_count']}")

    print("\n--- 4. Testing GET comments for post ---")
    comments_data = get(f"/api/posts/{first_post['id']}/comments/")
    comments = comments_data.get("comments", [])
    print(f"Post {first_post['id']} has {len(comments)} comments.")
    if comments:
        print(f"Latest comment by @{comments[0]['author']['username']}: {comments[0]['content']}")

    print("\n--- 5. Testing GET /api/users/suggestions/ ---")
    suggestions_data = get("/api/users/suggestions/")
    suggestions = suggestions_data.get("suggestions", [])
    print(f"Suggested creators: {len(suggestions)}")

    print("\n--- 6. Testing Interactive Session (Switch User, Create Post, Like, Comment, Follow) ---")
    # Test session with urllib cookie processor
    import urllib.request
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
    
    # Switch user to alex_dev
    switch_req = urllib.request.Request(
        f"{BASE}/api/auth/switch-user/",
        data=json.dumps({"username": "alex_dev"}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(switch_req) as resp:
        switch_res = json.loads(resp.read().decode())
        print(f"Switched user: {switch_res.get('message')}")
        assert switch_res.get("success"), "Failed to switch user"

    # Create a new post
    new_post_req = urllib.request.Request(
        f"{BASE}/api/posts/",
        data=json.dumps({
            "content": "Automated verification test pulse! Building sleek social systems.",
            "image_url": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&auto=format&fit=crop&q=80",
            "tag": "Verification"
        }).encode(),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(new_post_req) as resp:
        post_res = json.loads(resp.read().decode())
        created_id = post_res["post"]["id"]
        print(f"Created Post #{created_id} by @{post_res['post']['author']['username']}")

    # Like the first post
    like_req = urllib.request.Request(
        f"{BASE}/api/posts/{first_post['id']}/like/",
        data=json.dumps({}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(like_req) as resp:
        like_res = json.loads(resp.read().decode())
        print(f"Toggled like on Post #{first_post['id']}: Liked={like_res.get('liked')}, Total Likes={like_res.get('likes_count')}")

    # Add comment to the created post
    comment_req = urllib.request.Request(
        f"{BASE}/api/posts/{created_id}/comments/",
        data=json.dumps({"content": "Real-time automated comment verified!"}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(comment_req) as resp:
        comment_res = json.loads(resp.read().decode())
        print(f"Added comment to Post #{created_id}: \"{comment_res['comment']['content']}\" (Total comments: {comment_res['comments_count']})")

    # Toggle follow on dkim_photo
    follow_req = urllib.request.Request(
        f"{BASE}/api/users/dkim_photo/follow/",
        data=json.dumps({}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(follow_req) as resp:
        follow_res = json.loads(resp.read().decode())
        print(f"Followed @dkim_photo: Following={follow_res.get('following')}, Total Followers={follow_res.get('followers_count')}")

    print("\n=======================================================")
    print(">>> ALL SOCIAL MEDIA FEATURES VERIFIED END-TO-END! <<<")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
