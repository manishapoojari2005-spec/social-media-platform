/**
 * PULSE SOCIAL MEDIA PLATFORM — CLIENT APPLICATION
 * Core logic for feeds, posts, comments, likes, follows, profiles, and demo persona switching.
 */

const PRESET_IMAGES = {
    tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&auto=format&fit=crop&q=80',
    neon: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=80',
    nature: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&auto=format&fit=crop&q=80',
    space: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&auto=format&fit=crop&q=80',
    art: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80'
};

const AVATAR_PRESETS = {
    female: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    male: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
    robot: 'https://api.dicebear.com/7.x/bottts/svg?seed=pulse_bot',
    art: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=400&auto=format&fit=crop&q=80'
};

class PulseApp {
    constructor() {
        this.currentUser = null;
        this.currentView = 'feed'; // 'feed' | 'profile' | 'explore'
        this.feedFilter = 'for_you'; // 'for_you' | 'following'
        this.activeTag = null;
        this.searchQuery = null;
        this.posts = [];
        this.openComments = new Set();
        this.currentProfileUsername = null;
        this.composerImage = '';
        this.searchDebounceTimer = null;

        this.init();
    }

    async init() {
        // Close popovers on click outside
        document.addEventListener('click', (e) => {
            const popover = document.getElementById('user-popover');
            const userCard = document.getElementById('current-user-card');
            if (popover && !popover.contains(e.target) && !userCard.contains(e.target)) {
                popover.classList.add('hidden');
            }
        });

        // Fetch current session user
        await this.checkAuth();
        
        // Load initial data
        await Promise.all([
            this.loadPosts(),
            this.loadDemoUsers(),
            this.loadSuggestions()
        ]);

        // Handle URL Hash Routes
        this.handleHashRouting();
        window.addEventListener('hashchange', () => this.handleHashRouting());
    }

    handleHashRouting() {
        const hash = window.location.hash;
        if (hash.startsWith('#meet/')) {
            const roomId = hash.replace('#meet/', '').trim();
            if (roomId && window.pulseMeet) {
                this.navigate('meet');
                window.pulseMeet.initJoinRoom(roomId, false);
            }
        } else if (hash === '#meet') {
            this.navigate('meet');
        }
    }


    /* -------------------------------------------------------------------------
       CSRF & API HELPERS
       ------------------------------------------------------------------------- */
    getCsrfToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    async apiFetch(url, options = {}) {
        options.headers = options.headers || {};
        options.headers['X-CSRFToken'] = this.getCsrfToken();
        if (options.body && typeof options.body === 'object') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        
        const response = await fetch(url, options);
        return response.json();
    }

    /* -------------------------------------------------------------------------
       AUTHENTICATION & USER STATE
       ------------------------------------------------------------------------- */
    async checkAuth() {
        try {
            const data = await this.apiFetch('/api/auth/me/');
            if (data.authenticated && data.user) {
                this.currentUser = data.user;
                this.updateCurrentUserUI();
            } else {
                // Auto switch to default persona 'elena_v' if not logged in
                await this.switchUser('elena_v', false);
            }
        } catch (err) {
            console.error('Auth check error:', err);
        }
    }

    updateCurrentUserUI() {
        if (!this.currentUser) return;
        
        const myAvatar = document.getElementById('my-avatar');
        const myDisplayName = document.getElementById('my-display-name');
        const myHandle = document.getElementById('my-handle');
        const composerAvatar = document.getElementById('composer-avatar');

        if (myAvatar) myAvatar.src = this.currentUser.avatar;
        if (composerAvatar) composerAvatar.src = this.currentUser.avatar;
        if (myDisplayName) myDisplayName.textContent = this.currentUser.display_name;
        if (myHandle) myHandle.textContent = `@${this.currentUser.username}`;
    }

    toggleUserDropdown() {
        const popover = document.getElementById('user-popover');
        if (popover) {
            popover.classList.toggle('hidden');
        }
    }

    async switchUser(username, showToast = true) {
        try {
            const res = await this.apiFetch('/api/auth/switch-user/', {
                method: 'POST',
                body: { username }
            });

            if (res.success) {
                this.currentUser = res.user;
                this.updateCurrentUserUI();
                this.closeModal('persona-modal');
                if (showToast) {
                    this.showToast(`Logged in as @${res.user.username}`, 'success');
                }
                
                // Refresh views
                await Promise.all([
                    this.loadDemoUsers(),
                    this.loadSuggestions(),
                    this.loadPosts()
                ]);

                if (this.currentView === 'profile' && this.currentProfileUsername === this.currentUser.username) {
                    this.viewProfile(this.currentUser.username);
                }
            } else {
                this.showToast(res.error || 'Failed to switch user', 'error');
            }
        } catch (err) {
            console.error('Switch user error:', err);
            this.showToast('Error switching user', 'error');
        }
    }

    async handleQuickRegister(e) {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const displayName = document.getElementById('reg-name').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const bio = document.getElementById('reg-bio').value.trim();

        if (!username || !password) return;

        try {
            const res = await this.apiFetch('/api/auth/register/', {
                method: 'POST',
                body: { username, display_name: displayName, password, bio }
            });

            if (res.success) {
                this.currentUser = res.user;
                this.updateCurrentUserUI();
                this.closeModal('persona-modal');
                this.showToast(`Welcome to Pulse, @${res.user.username}!`, 'success');
                document.getElementById('new-user-quick-form').reset();
                await Promise.all([
                    this.loadDemoUsers(),
                    this.loadSuggestions(),
                    this.loadPosts()
                ]);
            } else {
                this.showToast(res.error || 'Registration failed', 'error');
            }
        } catch (err) {
            console.error('Registration error:', err);
            this.showToast('Failed to register account', 'error');
        }
    }

    async logout() {
        await this.apiFetch('/api/auth/logout/', { method: 'POST' });
        this.showToast('Signed out. Switching to guest session...', 'info');
        setTimeout(() => window.location.reload(), 600);
    }

    /* -------------------------------------------------------------------------
       POSTS FEED & COMPOSER
       ------------------------------------------------------------------------- */
    async loadPosts() {
        const stream = document.getElementById('posts-stream');
        if (!stream) return;

        stream.innerHTML = `
            <div class="feed-loader">
                <div class="spinner"></div>
                <span>Curating latest pulses...</span>
            </div>
        `;

        let url = `/api/posts/?filter=${this.feedFilter}`;
        if (this.activeTag) {
            url += `&tag=${encodeURIComponent(this.activeTag)}`;
        }
        if (this.searchQuery) {
            url += `&search=${encodeURIComponent(this.searchQuery)}`;
        }

        try {
            const data = await this.apiFetch(url);
            this.posts = data.posts || [];
            this.renderPosts(this.posts);
        } catch (err) {
            console.error('Failed to load posts:', err);
            stream.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h3>Unable to load feed</h3>
                    <p>Check network connection or try refreshing.</p>
                </div>
            `;
        }
    }

    renderPosts(postsList) {
        const stream = document.getElementById('posts-stream');
        if (!stream) return;

        if (postsList.length === 0) {
            stream.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-wind"></i>
                    <h3>No posts yet</h3>
                    <p>${this.feedFilter === 'following' 
                        ? 'Follow some creators to see their updates here, or switch to For You!' 
                        : 'Be the first one to create a post and spark a conversation!'}</p>
                </div>
            `;
            return;
        }

        stream.innerHTML = postsList.map(post => this.buildPostCardHtml(post)).join('');
    }

    buildPostCardHtml(post) {
        const formattedDate = this.formatRelativeTime(post.created_at);
        const isLiked = post.is_liked;
        const isAuthor = post.is_author;
        const authorFollowed = post.author.is_followed;
        const hasCommentsOpen = this.openComments.has(post.id);

        // Highlight tags in content
        const formattedContent = this.escapeHtml(post.content).replace(
            /#(\w+)/g,
            '<a href="#" class="hashtag" onclick="app.filterByTag(\'$1\'); return false;">#$1</a>'
        );

        return `
            <article class="post-card" id="post-${post.id}">
                <div class="post-header">
                    <div class="post-author-info">
                        <img 
                            src="${this.escapeHtml(post.author.avatar)}" 
                            alt="${this.escapeHtml(post.author.display_name)}" 
                            class="user-avatar-md"
                            onclick="app.viewProfile('${post.author.username}')" 
                            style="cursor: pointer;"
                        >
                        <div class="author-names">
                            <div class="author-row-top">
                                <a href="#" class="author-name-link" onclick="app.viewProfile('${post.author.username}'); return false;">
                                    ${this.escapeHtml(post.author.display_name)}
                                </a>
                                <span class="author-username">@${this.escapeHtml(post.author.username)}</span>
                                <span class="post-time">· ${formattedDate}</span>
                            </div>
                            ${post.tag ? `
                                <div>
                                    <span class="post-tag-badge" onclick="app.filterByTag('${post.tag}')">
                                        #${this.escapeHtml(post.tag)}
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="post-header-actions">
                        ${!isAuthor && this.currentUser ? `
                            <button 
                                class="btn-follow ${authorFollowed ? 'following' : ''}" 
                                onclick="app.toggleFollow('${post.author.username}', this)"
                            >
                                ${authorFollowed ? 'Following' : 'Follow'}
                            </button>
                        ` : ''}
                        ${isAuthor ? `
                            <button class="icon-btn text-danger" title="Delete post" onclick="app.deletePost(${post.id})">
                                <i class="fa-regular fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div class="post-content">${formattedContent}</div>

                ${post.image_url ? `
                    <div class="post-media-container">
                        <img src="${this.escapeHtml(post.image_url)}" alt="Post attachment" loading="lazy">
                    </div>
                ` : ''}

                <div class="post-action-bar">
                    <button class="action-btn btn-like ${isLiked ? 'liked' : ''}" id="like-btn-${post.id}" onclick="app.toggleLike(${post.id})">
                        <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                        <span id="like-count-${post.id}">${post.likes_count}</span>
                    </button>

                    <button class="action-btn btn-comment" onclick="app.toggleComments(${post.id})">
                        <i class="fa-regular fa-comment"></i>
                        <span id="comment-count-${post.id}">${post.comments_count}</span>
                    </button>

                    <button class="action-btn btn-share" onclick="app.sharePost(${post.id})">
                        <i class="fa-regular fa-share-from-square"></i>
                        <span>Share</span>
                    </button>

                    <button class="action-btn" onclick="app.bookmarkPost(${post.id})">
                        <i class="fa-regular fa-bookmark"></i>
                    </button>
                </div>

                <!-- Expandable Comments Drawer -->
                <div class="comments-drawer ${hasCommentsOpen ? '' : 'hidden'}" id="comments-drawer-${post.id}">
                    <div class="comments-list" id="comments-list-${post.id}">
                        <div class="feed-loader">
                            <div class="spinner"></div>
                        </div>
                    </div>

                    <div class="comment-input-row">
                        <div class="comment-input-box">
                            <input 
                                type="text" 
                                id="comment-input-${post.id}" 
                                placeholder="Reply to @${post.author.username}..." 
                                onkeypress="if(event.key === 'Enter') app.submitComment(${post.id})"
                            >
                        </div>
                        <button class="btn-send-comment" onclick="app.submitComment(${post.id})" title="Send Reply">
                            <i class="fa-solid fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    /* -------------------------------------------------------------------------
       POST CREATION & INTERACTIONS
       ------------------------------------------------------------------------- */
    handleComposerInput(textarea) {
        // Auto-expand textarea
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';

        const remaining = 1000 - textarea.value.length;
        const counter = document.getElementById('composer-char-count');
        if (counter) {
            counter.textContent = remaining;
            counter.style.color = remaining < 50 ? 'var(--rose)' : 'var(--text-muted)';
        }
    }

    toggleImageBar() {
        const bar = document.getElementById('composer-image-bar');
        bar.classList.toggle('hidden');
        if (!bar.classList.contains('hidden')) {
            document.getElementById('image-url-input').focus();
        }
    }

    toggleTagBar() {
        const bar = document.getElementById('composer-tag-bar');
        bar.classList.toggle('hidden');
        if (!bar.classList.contains('hidden')) {
            document.getElementById('tag-input').focus();
        }
    }

    insertEmoji(emoji) {
        const textarea = document.getElementById('composer-text');
        textarea.value += emoji;
        this.handleComposerInput(textarea);
        textarea.focus();
    }

    onImageUrlChange(url) {
        const preview = document.getElementById('composer-media-preview');
        const img = document.getElementById('composer-preview-img');
        if (url.trim()) {
            this.composerImage = url.trim();
            img.src = this.composerImage;
            preview.classList.remove('hidden');
        } else {
            this.removeComposerImage();
        }
    }

    applyPresetImage(type) {
        const url = PRESET_IMAGES[type];
        if (url) {
            document.getElementById('image-url-input').value = url;
            this.onImageUrlChange(url);
        }
    }

    removeComposerImage() {
        this.composerImage = '';
        const preview = document.getElementById('composer-media-preview');
        const input = document.getElementById('image-url-input');
        if (preview) preview.classList.add('hidden');
        if (input) input.value = '';
    }

    async createPost() {
        const textInput = document.getElementById('composer-text');
        const tagInput = document.getElementById('tag-input');
        const content = textInput.value.trim();
        const tag = tagInput ? tagInput.value.trim() : '';

        if (!content && !this.composerImage) {
            this.showToast('Please write something or attach a photo.', 'error');
            return;
        }

        const publishBtn = document.getElementById('publish-btn');
        publishBtn.disabled = true;
        publishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting...';

        try {
            const res = await this.apiFetch('/api/posts/', {
                method: 'POST',
                body: {
                    content,
                    image_url: this.composerImage,
                    tag
                }
            });

            if (res.success && res.post) {
                // Clear composer
                textInput.value = '';
                textInput.style.height = 'auto';
                if (tagInput) tagInput.value = '';
                this.removeComposerImage();
                document.getElementById('composer-image-bar').classList.add('hidden');
                document.getElementById('composer-tag-bar').classList.add('hidden');
                document.getElementById('composer-char-count').textContent = '1000';

                this.showToast('Pulse published to the world!', 'success');

                // If currently in profile or explore, return to feed
                if (this.currentView !== 'feed') {
                    this.navigate('feed');
                } else {
                    // Prepend new post to the top of current list
                    this.posts.unshift(res.post);
                    this.renderPosts(this.posts);
                }
            } else {
                this.showToast(res.error || 'Failed to publish post', 'error');
            }
        } catch (err) {
            console.error('Create post error:', err);
            this.showToast('Error creating post', 'error');
        } finally {
            publishBtn.disabled = false;
            publishBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Post</span>';
        }
    }

    async deletePost(postId) {
        if (!confirm('Are you sure you want to delete this pulse?')) return;

        try {
            const res = await this.apiFetch(`/api/posts/${postId}/`, { method: 'DELETE' });
            if (res.success) {
                this.showToast('Pulse deleted', 'success');
                this.posts = this.posts.filter(p => p.id !== postId);
                this.renderPosts(this.posts);
            } else {
                this.showToast(res.error || 'Unable to delete post', 'error');
            }
        } catch (err) {
            console.error('Delete post error:', err);
            this.showToast('Error deleting post', 'error');
        }
    }

    /* -------------------------------------------------------------------------
       LIKE SYSTEM
       ------------------------------------------------------------------------- */
    async toggleLike(postId) {
        const likeBtn = document.getElementById(`like-btn-${postId}`);
        const countSpan = document.getElementById(`like-count-${postId}`);
        if (!likeBtn || !countSpan) return;

        // Optimistic UI update
        const wasLiked = likeBtn.classList.contains('liked');
        let count = parseInt(countSpan.textContent, 10) || 0;
        
        if (wasLiked) {
            likeBtn.classList.remove('liked');
            likeBtn.querySelector('i').className = 'fa-regular fa-heart';
            count = Math.max(0, count - 1);
        } else {
            likeBtn.classList.add('liked');
            likeBtn.querySelector('i').className = 'fa-solid fa-heart';
            count += 1;
        }
        countSpan.textContent = count;

        try {
            const res = await this.apiFetch(`/api/posts/${postId}/like/`, { method: 'POST' });
            if (res.success) {
                countSpan.textContent = res.likes_count;
                if (res.liked) {
                    likeBtn.classList.add('liked');
                    likeBtn.querySelector('i').className = 'fa-solid fa-heart';
                } else {
                    likeBtn.classList.remove('liked');
                    likeBtn.querySelector('i').className = 'fa-regular fa-heart';
                }
            } else {
                // Revert
                if (wasLiked) {
                    likeBtn.classList.add('liked');
                } else {
                    likeBtn.classList.remove('liked');
                }
                this.showToast(res.error || 'Failed to update like', 'error');
            }
        } catch (err) {
            console.error('Like error:', err);
        }
    }

    /* -------------------------------------------------------------------------
       COMMENT SYSTEM
       ------------------------------------------------------------------------- */
    async toggleComments(postId) {
        const drawer = document.getElementById(`comments-drawer-${postId}`);
        if (!drawer) return;

        if (this.openComments.has(postId)) {
            this.openComments.delete(postId);
            drawer.classList.add('hidden');
        } else {
            this.openComments.add(postId);
            drawer.classList.remove('hidden');
            await this.loadComments(postId);
            const input = document.getElementById(`comment-input-${postId}`);
            if (input) input.focus();
        }
    }

    async loadComments(postId) {
        const list = document.getElementById(`comments-list-${postId}`);
        if (!list) return;

        try {
            const res = await this.apiFetch(`/api/posts/${postId}/comments/`);
            const comments = res.comments || [];
            
            if (comments.length === 0) {
                list.innerHTML = `<div class="text-muted" style="font-size: 0.85rem; padding: 4px 0;">No comments yet. Start the conversation!</div>`;
                return;
            }

            list.innerHTML = comments.map(c => `
                <div class="comment-item" id="comment-${c.id}">
                    <img src="${this.escapeHtml(c.author.avatar)}" alt="${this.escapeHtml(c.author.display_name)}" class="user-avatar-sm" style="width: 30px; height: 30px;" onclick="app.viewProfile('${c.author.username}')">
                    <div class="comment-body">
                        <div class="comment-author-row">
                            <span class="comment-author-name" onclick="app.viewProfile('${c.author.username}')">${this.escapeHtml(c.author.display_name)}</span>
                            <span class="author-username">@${this.escapeHtml(c.author.username)}</span>
                            <span class="comment-time">· ${this.formatRelativeTime(c.created_at)}</span>
                        </div>
                        <div class="comment-text">${this.escapeHtml(c.content)}</div>
                    </div>
                    ${c.is_author ? `
                        <button class="delete-comment-btn" title="Delete reply" onclick="app.deleteComment(${c.id}, ${postId})">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');
        } catch (err) {
            console.error('Load comments error:', err);
            list.innerHTML = `<div class="text-danger" style="font-size:0.85rem;">Failed to load comments</div>`;
        }
    }

    async submitComment(postId) {
        const input = document.getElementById(`comment-input-${postId}`);
        if (!input) return;

        const content = input.value.trim();
        if (!content) return;

        input.disabled = true;

        try {
            const res = await this.apiFetch(`/api/posts/${postId}/comments/`, {
                method: 'POST',
                body: { content }
            });

            if (res.success && res.comment) {
                input.value = '';
                const countSpan = document.getElementById(`comment-count-${postId}`);
                if (countSpan) countSpan.textContent = res.comments_count;
                await this.loadComments(postId);
                this.showToast('Reply added', 'success');
            } else {
                this.showToast(res.error || 'Failed to post comment', 'error');
            }
        } catch (err) {
            console.error('Submit comment error:', err);
            this.showToast('Error sending reply', 'error');
        } finally {
            input.disabled = false;
            input.focus();
        }
    }

    async deleteComment(commentId, postId) {
        try {
            const res = await this.apiFetch(`/api/comments/${commentId}/`, { method: 'DELETE' });
            if (res.success) {
                const countSpan = document.getElementById(`comment-count-${postId}`);
                if (countSpan) countSpan.textContent = res.comments_count;
                await this.loadComments(postId);
                this.showToast('Reply removed', 'success');
            } else {
                this.showToast(res.error || 'Failed to delete reply', 'error');
            }
        } catch (err) {
            console.error('Delete comment error:', err);
        }
    }

    /* -------------------------------------------------------------------------
       FOLLOW SYSTEM
       ------------------------------------------------------------------------- */
    async toggleFollow(username, btnElement) {
        if (!btnElement) return;

        const isFollowing = btnElement.classList.contains('following');
        // Optimistic toggle
        if (isFollowing) {
            btnElement.classList.remove('following');
            btnElement.textContent = 'Follow';
        } else {
            btnElement.classList.add('following');
            btnElement.textContent = 'Following';
        }

        try {
            const res = await this.apiFetch(`/api/users/${username}/follow/`, { method: 'POST' });
            if (res.success) {
                if (res.following) {
                    btnElement.classList.add('following');
                    btnElement.textContent = 'Following';
                    this.showToast(`You followed @${username}`, 'success');
                } else {
                    btnElement.classList.remove('following');
                    btnElement.textContent = 'Follow';
                    this.showToast(`Unfollowed @${username}`, 'info');
                }

                // If on profile view for this user, update follower count
                const profileFollowersCount = document.getElementById('profile-followers-count');
                if (profileFollowersCount && this.currentProfileUsername === username) {
                    profileFollowersCount.textContent = res.followers_count;
                }

                // Refresh suggestions
                this.loadSuggestions();
            } else {
                // Revert
                if (isFollowing) {
                    btnElement.classList.add('following');
                    btnElement.textContent = 'Following';
                } else {
                    btnElement.classList.remove('following');
                    btnElement.textContent = 'Follow';
                }
                this.showToast(res.error || 'Failed to follow user', 'error');
            }
        } catch (err) {
            console.error('Follow error:', err);
        }
    }

    /* -------------------------------------------------------------------------
       USER PROFILES
       ------------------------------------------------------------------------- */
    async viewProfile(username) {
        this.currentView = 'profile';
        this.currentProfileUsername = username;

        // Update nav active states
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        if (this.currentUser && this.currentUser.username === username) {
            const navProfile = document.getElementById('nav-profile');
            if (navProfile) navProfile.classList.add('active');
        }

        // Hide feed header, banner & composer; show profile view
        document.getElementById('feed-header').classList.add('hidden');
        document.getElementById('filter-banner').classList.add('hidden');
        document.getElementById('composer-card').classList.add('hidden');
        document.getElementById('posts-stream').classList.add('hidden');

        const profileContainer = document.getElementById('profile-view');
        profileContainer.classList.remove('hidden');
        profileContainer.innerHTML = `
            <div class="feed-loader">
                <div class="spinner"></div>
                <span>Loading profile for @${username}...</span>
            </div>
        `;

        try {
            const data = await this.apiFetch(`/api/users/${username}/`);
            const p = data.profile;
            const posts = data.posts || [];

            profileContainer.innerHTML = `
                <div class="profile-header-bar" style="padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; gap: 16px;">
                    <button class="icon-btn" onclick="app.navigate('feed')" title="Back to Feed">
                        <i class="fa-solid fa-arrow-left"></i>
                    </button>
                    <div>
                        <div style="font-weight: 800; font-size: 1.15rem;">${this.escapeHtml(p.display_name)}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${p.posts_count} pulses</div>
                    </div>
                </div>

                <div class="profile-cover-banner">
                    <img src="${this.escapeHtml(p.cover_image)}" alt="Cover">
                    <div class="profile-cover-overlay"></div>
                </div>

                <div class="profile-meta-section">
                    <div class="profile-avatar-row">
                        <img src="${this.escapeHtml(p.avatar)}" alt="${this.escapeHtml(p.display_name)}" class="profile-avatar-lg">
                        <div>
                            ${p.is_self ? `
                                <button class="btn btn-outline" onclick="app.openEditProfileModal()">
                                    <i class="fa-solid fa-pen"></i> Edit Profile
                                </button>
                            ` : `
                                <button 
                                    class="btn-follow ${p.is_following ? 'following' : ''}" 
                                    onclick="app.toggleFollow('${p.username}', this)"
                                    style="padding: 8px 24px; font-size: 0.95rem;"
                                >
                                    ${p.is_following ? 'Following' : 'Follow'}
                                </button>
                            `}
                        </div>
                    </div>

                    <div class="profile-details">
                        <h1>${this.escapeHtml(p.display_name)}</h1>
                        <div class="handle">@${this.escapeHtml(p.username)}</div>
                        
                        ${p.bio ? `<p class="profile-bio">${this.escapeHtml(p.bio)}</p>` : ''}

                        <div class="profile-extra-info">
                            ${p.location ? `<span><i class="fa-solid fa-location-dot"></i> ${this.escapeHtml(p.location)}</span>` : ''}
                            ${p.website ? `<a href="${this.escapeHtml(p.website)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-link"></i> ${this.escapeHtml(p.website)}</a>` : ''}
                            <span><i class="fa-regular fa-calendar"></i> Joined ${p.created_at || 'Recent'}</span>
                        </div>

                        <div class="profile-stats-row">
                            <div class="stat-item">
                                <strong>${p.following_count}</strong> Following
                            </div>
                            <div class="stat-item">
                                <strong id="profile-followers-count">${p.followers_count}</strong> Followers
                            </div>
                            <div class="stat-item">
                                <strong>${p.posts_count}</strong> Pulses
                            </div>
                        </div>
                    </div>
                </div>

                <div class="profile-posts-header">
                    <i class="fa-solid fa-newspaper"></i>
                    <span>Pulses by @${p.username}</span>
                </div>

                <div class="profile-posts-stream" id="profile-posts-stream">
                    ${posts.length > 0 ? posts.map(post => this.buildPostCardHtml(post)).join('') : `
                        <div class="empty-state">
                            <i class="fa-regular fa-newspaper"></i>
                            <h3>No pulses posted yet</h3>
                            <p>@${p.username} has not posted any updates.</p>
                        </div>
                    `}
                </div>
            `;
        } catch (err) {
            console.error('Failed to load profile:', err);
            profileContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-user-xmark"></i>
                    <h3>User not found</h3>
                    <p>The profile @${username} does not exist or has been removed.</p>
                    <button class="btn btn-primary mt-2" onclick="app.navigate('feed')">Return to Feed</button>
                </div>
            `;
        }
    }

    viewMyProfile() {
        if (this.currentUser) {
            this.viewProfile(this.currentUser.username);
        }
    }

    openEditProfileModal() {
        if (!this.currentUser) return;
        document.getElementById('edit-name').value = this.currentUser.display_name || '';
        document.getElementById('edit-bio').value = this.currentUser.bio || '';
        document.getElementById('edit-avatar').value = this.currentUser.avatar || '';
        document.getElementById('edit-cover').value = this.currentUser.cover_image || '';
        document.getElementById('edit-location').value = this.currentUser.location || '';
        document.getElementById('edit-website').value = this.currentUser.website || '';
        
        document.getElementById('edit-profile-modal').classList.remove('hidden');
    }

    setEditAvatarPreset(type) {
        const url = AVATAR_PRESETS[type];
        if (url) {
            document.getElementById('edit-avatar').value = url;
        }
    }

    async saveProfile() {
        const displayName = document.getElementById('edit-name').value.trim();
        const bio = document.getElementById('edit-bio').value.trim();
        const avatar = document.getElementById('edit-avatar').value.trim();
        const coverImage = document.getElementById('edit-cover').value.trim();
        const location = document.getElementById('edit-location').value.trim();
        const website = document.getElementById('edit-website').value.trim();

        try {
            const res = await this.apiFetch('/api/users/profile/', {
                method: 'PUT',
                body: {
                    display_name: displayName,
                    bio,
                    avatar,
                    cover_image: coverImage,
                    location,
                    website
                }
            });

            if (res.success && res.user) {
                this.currentUser = res.user;
                this.updateCurrentUserUI();
                this.closeModal('edit-profile-modal');
                this.showToast('Profile updated!', 'success');
                if (this.currentView === 'profile' && this.currentProfileUsername === this.currentUser.username) {
                    this.viewProfile(this.currentUser.username);
                }
            } else {
                this.showToast(res.error || 'Failed to update profile', 'error');
            }
        } catch (err) {
            console.error('Save profile error:', err);
            this.showToast('Error saving profile changes', 'error');
        }
    }

    /* -------------------------------------------------------------------------
       DEMO PERSONA SWITCHER & SUGGESTIONS
       ------------------------------------------------------------------------- */
    async loadDemoUsers() {
        try {
            const res = await this.apiFetch('/api/users/demo/');
            const users = res.users || [];
            
            // Quick switcher widget in right sidebar
            const quickList = document.getElementById('persona-quick-list');
            if (quickList) {
                quickList.innerHTML = users.map(u => `
                    <div 
                        class="persona-row-chip ${u.is_current ? 'active-persona' : ''}" 
                        onclick="app.switchUser('${u.username}')"
                        title="Click to act as ${u.display_name}"
                    >
                        <div class="persona-chip-info">
                            <img src="${this.escapeHtml(u.avatar)}" alt="${this.escapeHtml(u.display_name)}" class="user-avatar-sm" style="width: 32px; height: 32px;">
                            <div>
                                <div class="persona-chip-name">${this.escapeHtml(u.display_name)}</div>
                                <div class="persona-chip-handle">@${this.escapeHtml(u.username)}</div>
                            </div>
                        </div>
                        ${u.is_current ? '<span class="current-indicator"><i class="fa-solid fa-check"></i> Active</span>' : ''}
                    </div>
                `).join('');
            }

            // Modal grid
            const modalGrid = document.getElementById('persona-modal-grid');
            if (modalGrid) {
                modalGrid.innerHTML = users.map(u => `
                    <div 
                        class="persona-modal-card ${u.is_current ? 'active' : ''}"
                        onclick="app.switchUser('${u.username}')"
                    >
                        <div class="persona-chip-info">
                            <img src="${this.escapeHtml(u.avatar)}" alt="${this.escapeHtml(u.display_name)}" class="user-avatar-md">
                            <div>
                                <div class="persona-chip-name" style="font-size: 0.98rem;">${this.escapeHtml(u.display_name)}</div>
                                <div class="persona-chip-handle">@${this.escapeHtml(u.username)}</div>
                                <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 3px;">${this.escapeHtml(u.bio || '')}</div>
                            </div>
                        </div>
                        ${u.is_current 
                            ? '<span class="current-indicator"><i class="fa-solid fa-circle-check"></i> Current User</span>' 
                            : '<button class="btn btn-sm btn-outline">Switch</button>'}
                    </div>
                `).join('');
            }
        } catch (err) {
            console.error('Failed to load demo users:', err);
        }
    }

    openPersonaModal() {
        document.getElementById('persona-modal').classList.remove('hidden');
    }

    async loadSuggestions() {
        const container = document.getElementById('suggestions-container');
        if (!container) return;

        try {
            const res = await this.apiFetch('/api/users/suggestions/');
            const suggestions = res.suggestions || [];

            if (suggestions.length === 0) {
                container.innerHTML = `<div class="text-muted" style="font-size: 0.85rem;">You are following all creators!</div>`;
                return;
            }

            container.innerHTML = suggestions.map(u => `
                <div class="suggestion-item">
                    <div class="suggestion-user-info" onclick="app.viewProfile('${u.username}')">
                        <img src="${this.escapeHtml(u.avatar)}" alt="${this.escapeHtml(u.display_name)}" class="user-avatar-sm">
                        <div>
                            <div class="user-display-name">${this.escapeHtml(u.display_name)}</div>
                            <div class="user-handle">@${this.escapeHtml(u.username)}</div>
                        </div>
                    </div>
                    <button class="btn-follow" onclick="app.toggleFollow('${u.username}', this)">Follow</button>
                </div>
            `).join('');
        } catch (err) {
            console.error('Suggestions error:', err);
        }
    }

    /* -------------------------------------------------------------------------
       NAVIGATION, SEARCH & FILTERS
       ------------------------------------------------------------------------- */
    navigate(viewName) {
        this.currentView = viewName;

        // Reset nav item classes
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        const feedHeader = document.getElementById('feed-header');
        const composerCard = document.getElementById('composer-card');
        const postsStream = document.getElementById('posts-stream');
        const profileView = document.getElementById('profile-view');
        const meetLobby = document.getElementById('meet-lobby-view');

        if (viewName === 'feed') {
            document.getElementById('nav-home')?.classList.add('active');
            feedHeader?.classList.remove('hidden');
            composerCard?.classList.remove('hidden');
            postsStream?.classList.remove('hidden');
            profileView?.classList.add('hidden');
            meetLobby?.classList.add('hidden');
            this.loadPosts();
        } else if (viewName === 'explore') {
            document.getElementById('nav-explore')?.classList.add('active');
            feedHeader?.classList.remove('hidden');
            composerCard?.classList.add('hidden');
            postsStream?.classList.remove('hidden');
            profileView?.classList.add('hidden');
            meetLobby?.classList.add('hidden');
            this.setFeedFilter('for_you');
        } else if (viewName === 'meet') {
            document.getElementById('nav-meet')?.classList.add('active');
            feedHeader?.classList.add('hidden');
            composerCard?.classList.add('hidden');
            postsStream?.classList.add('hidden');
            profileView?.classList.add('hidden');
            meetLobby?.classList.remove('hidden');
            if (window.pulseMeet) {
                window.pulseMeet.loadRooms();
            }
        }
    }

    openJoinCodePrompt() {
        const code = prompt('Enter Collaboration Space ID or Code:');
        if (code && code.trim()) {
            if (window.pulseMeet) {
                window.pulseMeet.initJoinRoom(code.trim(), false);
            }
        }
    }


    setFeedFilter(filter) {
        this.feedFilter = filter;
        this.navigate('feed');

        // Update tabs
        const tabForYou = document.getElementById('tab-for-you');
        const tabFollowing = document.getElementById('tab-following');
        const navFollowing = document.getElementById('nav-following');
        const navHome = document.getElementById('nav-home');

        if (filter === 'for_you') {
            tabForYou.classList.add('active');
            tabFollowing.classList.remove('active');
            navHome.classList.add('active');
            navFollowing.classList.remove('active');
        } else {
            tabFollowing.classList.add('active');
            tabForYou.classList.remove('active');
            navFollowing.classList.add('active');
            navHome.classList.remove('active');
        }

        this.loadPosts();
    }

    filterByTag(tag) {
        this.activeTag = tag;
        this.navigate('feed');

        const banner = document.getElementById('filter-banner');
        const bannerText = document.getElementById('filter-banner-text');
        bannerText.textContent = `Showing pulses tagged #${tag}`;
        banner.classList.remove('hidden');

        this.loadPosts();
    }

    clearFilters() {
        this.activeTag = null;
        this.searchQuery = null;
        document.getElementById('filter-banner').classList.add('hidden');
        document.getElementById('global-search-input').value = '';
        document.getElementById('clear-search-btn').classList.add('hidden');
        this.loadPosts();
    }

    handleSearch(event) {
        const query = event.target.value.trim();
        const clearBtn = document.getElementById('clear-search-btn');

        if (query) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }

        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
            this.searchQuery = query || null;
            if (this.searchQuery) {
                this.navigate('feed');
                const banner = document.getElementById('filter-banner');
                const bannerText = document.getElementById('filter-banner-text');
                bannerText.textContent = `Search results for "${this.searchQuery}"`;
                banner.classList.remove('hidden');
            } else {
                document.getElementById('filter-banner').classList.add('hidden');
            }
            this.loadPosts();
        }, 300);
    }

    clearSearch() {
        document.getElementById('global-search-input').value = '';
        document.getElementById('clear-search-btn').classList.add('hidden');
        this.searchQuery = null;
        document.getElementById('filter-banner').classList.add('hidden');
        this.loadPosts();
    }

    focusCompose() {
        this.navigate('feed');
        const textarea = document.getElementById('composer-text');
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textarea.focus();
    }

    sharePost(postId) {
        const url = `${window.location.origin}/#post-${postId}`;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Pulse link copied to clipboard!', 'success');
        }).catch(() => {
            this.showToast(`Post ID: #${postId}`, 'info');
        });
    }

    bookmarkPost(postId) {
        this.showToast('Pulse saved to your bookmarks!', 'success');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }

    /* -------------------------------------------------------------------------
       UTILITIES & TOASTS
       ------------------------------------------------------------------------- */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const iconClass = type === 'success' 
            ? 'fa-solid fa-circle-check' 
            : type === 'error' 
                ? 'fa-solid fa-triangle-exclamation' 
                : 'fa-solid fa-circle-info';

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="${iconClass}"></i>
            <span>${this.escapeHtml(message)}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.25s ease';
            setTimeout(() => toast.remove(), 260);
        }, 3200);
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatRelativeTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'just now';
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) return `${diffInDays}d ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

// Instantiate and expose globally
window.app = new PulseApp();
