from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from social.models import UserProfile, Post, Comment, Like, Follow

class Command(BaseCommand):
    help = 'Seeds initial sample users, posts, comments, likes, and followers'

    def handle(self, *args, **options):
        self.stdout.write("Seeding Pulse social data...")

        users_data = [
            {
                'username': 'elena_v',
                'password': 'password123',
                'display_name': 'Elena Vance',
                'bio': 'Creative Technologist & UI Architect 🎨 Exploring the intersection of spatial computing, generative design, and silky-smooth micro-interactions.',
                'avatar': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
                'cover_image': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1400&auto=format&fit=crop&q=80',
                'location': 'San Francisco, CA',
                'website': 'https://elenavance.design',
            },
            {
                'username': 'alex_dev',
                'password': 'password123',
                'display_name': 'Alex Rivera',
                'bio': 'Full-stack Systems Hacker ⚡ Building high-throughput APIs in Python, Rust & TypeScript. Night owl coder & espresso connoisseur.',
                'avatar': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
                'cover_image': 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1400&auto=format&fit=crop&q=80',
                'location': 'Austin, TX',
                'website': 'https://github.com/alexrivera',
            },
            {
                'username': 'maya_design',
                'password': 'password123',
                'display_name': 'Maya Lin',
                'bio': '3D & Motion Visualizer 🌿 Finding zen in glass textures, ambient lighting, and brutalist geometric forms.',
                'avatar': 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
                'cover_image': 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1400&auto=format&fit=crop&q=80',
                'location': 'Tokyo, Japan',
                'website': 'https://mayadesign.studio',
            },
            {
                'username': 'dkim_photo',
                'password': 'password123',
                'display_name': 'David Kim',
                'bio': 'Street & Architectural Photographer 📸 Neon reflections in the rain, midnight skylines, and quiet subway corners.',
                'avatar': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
                'cover_image': 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1400&auto=format&fit=crop&q=80',
                'location': 'Seoul, South Korea',
                'website': 'https://davidkim.photo',
            },
            {
                'username': 'sophia_ai',
                'password': 'password123',
                'display_name': 'Dr. Sophia Chen',
                'bio': 'AI Research Scientist 🧠 Developing agentic models, multimodal reasoning & human-AI co-creation frameworks.',
                'avatar': 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
                'cover_image': 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1400&auto=format&fit=crop&q=80',
                'location': 'Zürich, Switzerland',
                'website': 'https://sophia-chen.ai',
            }
        ]

        created_users = {}
        for udata in users_data:
            user, created = User.objects.get_or_create(username=udata['username'])
            user.set_password(udata['password'])
            user.save()

            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.display_name = udata['display_name']
            profile.bio = udata['bio']
            profile.avatar = udata['avatar']
            profile.cover_image = udata['cover_image']
            profile.location = udata['location']
            profile.website = udata['website']
            profile.save()
            created_users[udata['username']] = user

        # Seed Posts
        posts_data = [
            {
                'author': created_users['elena_v'],
                'content': 'Just pushed the final revision of our new glassmorphism interface system! Focusing on subtle light refraction, responsive depth layers, and 120fps physics animations. What do you think about the frosted card styling? ✨',
                'image_url': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1000&auto=format&fit=crop&q=80',
                'tag': 'DesignSystems',
            },
            {
                'author': created_users['dkim_photo'],
                'content': 'Midnight stroll through Shinjuku after a sudden autumn drizzle. The neon signs reflection on the wet asphalt looks like an oil painting from 2049. No filters, just raw Leica colors. 🌧️🏮',
                'image_url': 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1000&auto=format&fit=crop&q=80',
                'tag': 'Photography',
            },
            {
                'author': created_users['alex_dev'],
                'content': 'Migrated our core notification worker to an async event-driven architecture. Response latency dropped from 240ms to 14ms! Clean code + zero memory leaks. Remember: premature optimization is bad, but architectural bottlenecks will always catch up to you. 🚀💻',
                'image_url': 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1000&auto=format&fit=crop&q=80',
                'tag': 'WebDev',
            },
            {
                'author': created_users['sophia_ai'],
                'content': 'Exciting milestone today! Our multimodal reasoning agent just benchmarked in the top 98th percentile for spatial code-synthesis. The transition from pure prompt engineering to autonomous collaborative agents is happening much faster than anticipated. 🤖🔬',
                'image_url': 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1000&auto=format&fit=crop&q=80',
                'tag': 'AI',
            },
            {
                'author': created_users['maya_design'],
                'content': 'Morning render test with octane and ambient occlusion. Minimalist Scandinavian architecture bathed in soft golden hour light. Design isn’t just how it looks, it’s the sense of calm it brings. ☕🏛️',
                'image_url': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1000&auto=format&fit=crop&q=80',
                'tag': '3DArt',
            },
            {
                'author': created_users['elena_v'],
                'content': 'Quick poll for frontend engineers and designers: do you prefer spring physics for modal dismissal or timed ease-out cubic beziers? Springs feel so much more organic on touch screens! 💡',
                'image_url': '',
                'tag': 'UIUX',
            }
        ]

        created_posts = []
        for pdata in posts_data:
            post, _ = Post.objects.get_or_create(
                author=pdata['author'],
                content=pdata['content'],
                defaults={'image_url': pdata['image_url'], 'tag': pdata['tag']}
            )
            created_posts.append(post)

        # Seed Follows
        follow_pairs = [
            ('elena_v', 'alex_dev'),
            ('elena_v', 'maya_design'),
            ('elena_v', 'dkim_photo'),
            ('alex_dev', 'elena_v'),
            ('alex_dev', 'sophia_ai'),
            ('maya_design', 'elena_v'),
            ('maya_design', 'dkim_photo'),
            ('dkim_photo', 'elena_v'),
            ('sophia_ai', 'alex_dev'),
            ('sophia_ai', 'elena_v'),
        ]

        for f_from, f_to in follow_pairs:
            Follow.objects.get_or_create(
                follower=created_users[f_from],
                following=created_users[f_to]
            )

        # Seed Likes
        like_pairs = [
            (created_users['alex_dev'], created_posts[0]),
            (created_users['maya_design'], created_posts[0]),
            (created_users['sophia_ai'], created_posts[0]),
            (created_users['elena_v'], created_posts[1]),
            (created_users['maya_design'], created_posts[1]),
            (created_users['elena_v'], created_posts[2]),
            (created_users['sophia_ai'], created_posts[2]),
            (created_users['alex_dev'], created_posts[3]),
            (created_users['elena_v'], created_posts[3]),
            (created_users['dkim_photo'], created_posts[4]),
            (created_users['elena_v'], created_posts[4]),
            (created_users['alex_dev'], created_posts[5]),
        ]

        for u, p in like_pairs:
            Like.objects.get_or_create(user=u, post=p)

        # Seed Comments
        comments_data = [
            (created_posts[0], created_users['alex_dev'], 'The glass blur and border gradient look stunning! How is performance during rapid scrolling?'),
            (created_posts[0], created_users['elena_v'], '@alex_dev Thanks Alex! Using backdrop-filter with hardware accelerated translateZ(0), stays locked at 60/120fps!'),
            (created_posts[0], created_users['maya_design'], 'Absolute perfection, Elena. Loving the subtle depth layering.'),
            (created_posts[1], created_users['elena_v'], 'The lighting in this is unbelievable David! Shinjuku on a rainy night never fails to amaze.'),
            (created_posts[1], created_users['alex_dev'], 'Blade Runner vibes right here. Amazing shot! 📸'),
            (created_posts[2], created_users['sophia_ai'], '14ms latency is crazy fast! Is this using asynchronous event loop or worker pools?'),
            (created_posts[3], created_users['alex_dev'], 'Exciting times ahead! Would love to see the benchmark breakdown on this.'),
            (created_posts[4], created_users['dkim_photo'], 'The warm sunlight balance against the concrete is gorgeous Maya!'),
        ]

        for p, u, c_text in comments_data:
            Comment.objects.get_or_create(post=p, author=u, content=c_text)

        self.stdout.write(self.style.SUCCESS("Successfully seeded Pulse social database!"))
