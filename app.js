/**
 * Sites Platform - Application JavaScript
 * Version 4.0
 * 
 * All application logic, features, and functionality
 * 
 * Features included:
 * - Authentication & User Management
 * - Post Creation & Management
 * - 5-Star Rating System
 * - Comments & Reactions
 * - Collections & Bookmarks
 * - User Profiles & Badges
 * - XP & Leveling System
 * - Leaderboards
 * - Tag System
 * - Advanced Filters
 * - Report System
 * - Notifications
 * - And 30+ more features!
 */

        const JSONBIN_BIN_ID = '6983d8beae596e708f11cce9';
        const JSONBIN_API_KEY = '$2a$10$Ox2C/m6ECVIDRARFg.ifzekbKzouNxBa1wbPErYBtbuXD2vJWCnIu';
        const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

        let currentUser = null;
        let isAdmin = false;
        let appData = { 
            users: [], 
            games: [], 
            stars: {}, 
            deletedGames: [], 
            comments: [], 
            userSettings: {},
            ratings: {}, // 5-star ratings: { gameId: { username: rating } }
            profiles: {}, // User profiles: { username: { bio, avatar, badges, verified } }
            follows: {}, // Follow system: { username: [followed_usernames] }
            notifications: [], // Notifications: [{ id, user, type, message, read, date }]
            tags: {}, // Post tags: { gameId: [tag1, tag2] }
            collections: {}, // User collections: { username: [{ name, posts[] }] }
            reactions: {}, // Reactions: { gameId: { username: emoji } }
            views: {}, // Post views: { gameId: viewCount }
            recentlyViewed: {}, // Recently viewed: { username: [gameIds] }
            badges: {}, // User badges: { username: [badge_ids] }
            reports: [], // Reports: [{ id, reporter, postId, commentId, reason, details, date }]
            verifiedUsers: [], // List of verified usernames
            featuredPosts: [], // Featured/pinned posts
            xp: {}, // User XP: { username: xpAmount }
            levels: {}, // User levels: { username: levelNumber }
            pinnedPosts: [], // Phase 5: Array of pinned post IDs (admin + creator can pin)
            bookmarks: {} // Phase 5: User bookmarks { username: [postIds] }
        };
        let currentGameUrl = '';
        let pendingDeleteGameId = null;
        let currentPostUrls = []; // Temporary storage for URLs being added/edited
        let searchActive = false;
        let filteredGames = [];
        let activeFilters = { tag: '', rating: 0, date: 'all', creator: '' }; // Phase 4 filters
        
        // Profanity filter
        const badWords = ['fuck', 'shit', 'bitch', 'ass', 'damn', 'hell', 'crap', 'bastard', 'dick', 'pussy', 'cock', 'whore', 'slut', 'fag', 'nigger', 'nigga', 'retard', 'cunt'];

        function containsProfanity(text) {
            if (!text) return false;
            const lowerText = text.toLowerCase();
            return badWords.some(word => {
                const regex = new RegExp('\\b' + word + '\\b', 'i');
                return regex.test(lowerText);
            });
        }

        // Debug logging
        function debugLog(message) {
            console.log(message);
            const log = document.getElementById('debugLog');
            if (log) {
                log.innerHTML += '<div style="padding: 2px 0; border-bottom: 1px solid #ddd;">' + message + '</div>';
                log.scrollTop = log.scrollHeight; // Auto-scroll to bottom
            }
        }

        function toggleDebug() {
            const modal = document.getElementById('debugModal');
            if (modal.style.display === 'none') {
                modal.style.display = 'flex';
            } else {
                modal.style.display = 'none';
            }
        }

        function clearDebug() {
            const log = document.getElementById('debugLog');
            if (log) {
                log.innerHTML = '<div style="color: #999; font-style: italic;">Debug log cleared</div>';
            }
        }

        // SEARCH FUNCTIONS
        function applySortAndFilter() {
            if (searchActive) {
                performSearch();
            } else {
                loadBrowse();
            }
        }

        function sortGames(games) {
            const sortType = document.getElementById('sortSelect').value;
            const sorted = [...games];
            
            switch (sortType) {
                case 'newest':
                    sorted.sort((a, b) => {
                        const dateA = new Date(a.dateAdded || 0);
                        const dateB = new Date(b.dateAdded || 0);
                        return dateB - dateA;
                    });
                    break;
                case 'oldest':
                    sorted.sort((a, b) => {
                        const dateA = new Date(a.dateAdded || 0);
                        const dateB = new Date(b.dateAdded || 0);
                        return dateA - dateB;
                    });
                    break;
                case 'trending':
                    // Calculate trending score for each post
                    const now = Date.now();
                    const DAY_MS = 24 * 60 * 60 * 1000;
                    
                    sorted.forEach(game => {
                        const age = (now - new Date(game.dateAdded).getTime()) / DAY_MS;
                        const ratingCount = getRatingCount(game.id);
                        const avgRating = parseFloat(getAverageRating(game.id)) || 0;
                        const commentCount = appData.comments ? appData.comments.filter(c => c.postId === game.id).length : 0;
                        const viewCount = appData.views[game.id] || 0;
                        
                        // Trending score formula
                        game._trendingScore = ((ratingCount * avgRating * 2) + (commentCount * 1.5) + (viewCount * 0.1)) / (age + 2);
                    });
                    
                    sorted.sort((a, b) => (b._trendingScore || 0) - (a._trendingScore || 0));
                    break;
                case 'starred':
                    sorted.sort((a, b) => {
                        const starsA = Object.values(appData.stars).filter(arr => arr.includes(a.id)).length;
                        const starsB = Object.values(appData.stars).filter(arr => arr.includes(b.id)).length;
                        return starsB - starsA;
                    });
                    break;
                case 'alphabetical':
                    sorted.sort((a, b) => a.title.localeCompare(b.title));
                    break;
            }
            
            return sorted;
        }

        function performSearch() {
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            
            if (!query) {
                searchActive = false;
                document.getElementById('searchResults').textContent = '';
                loadBrowse(); // Show all posts
                return;
            }
            
            searchActive = true;
            filteredGames = appData.games.filter(game => {
                const titleMatch = game.title.toLowerCase().includes(query);
                const descMatch = (game.description || '').toLowerCase().includes(query);
                const creatorMatch = (game.creator || '').toLowerCase().includes(query);
                return titleMatch || descMatch || creatorMatch;
            });
            
            // Apply sorting
            filteredGames = sortGames(filteredGames);
            
            document.getElementById('searchResults').textContent = 
                `Found ${filteredGames.length} result${filteredGames.length !== 1 ? 's' : ''}`;
            
            // Display filtered results
            const gallery = document.getElementById('browseGallery');
            if (filteredGames.length === 0) {
                gallery.innerHTML = '<div class="no-games">No posts match your search</div>';
            } else {
                gallery.innerHTML = filteredGames.map(game => createGameCard(game)).join('');
            }
            
            debugLog('🔍 Search: "' + query + '" - Found: ' + filteredGames.length);
        }

        function clearSearch() {
            document.getElementById('searchInput').value = '';
            document.getElementById('searchResults').textContent = '';
            searchActive = false;
            loadBrowse();
        }

        async function refreshPosts() {
            debugLog('🔄 Refreshing posts...');
            const refreshBtn = event.target;
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳ Loading...';
            
            // Reload data from server
            await loadData();
            
            // Reload all content
            loadAllContent();
            
            // Force refresh the current visible tab
            const activeTab = document.querySelector('.nav-tab.active');
            if (activeTab) {
                const activeTabText = activeTab.textContent.toLowerCase();
                if (activeTabText.includes('browse')) {
                    loadBrowse();
                } else if (activeTabText.includes('my posts')) {
                    loadMyGames();
                } else if (activeTabText.includes('starred')) {
                    loadStarred();
                }
            }
            
            refreshBtn.disabled = false;
            refreshBtn.textContent = '🔄 Refresh';
            
            debugLog('✅ Posts refreshed');
        }

        function normalizeUrl(url) {
            // Remove leading/trailing whitespace
            url = url.trim();
            
            // If empty, return as is
            if (!url) return url;
            
            // If it already has a protocol, return as is
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return url;
            }
            
            // Add https:// if missing
            return 'https://' + url;
        }

        // AUTH ERROR DISPLAY
        function showAuthError(message) {
            const errorDiv = document.getElementById('authMessage');
            if (errorDiv) {
                errorDiv.textContent = '❌ ' + message;
                errorDiv.style.display = 'block';
                errorDiv.style.background = '#ffebee';
                errorDiv.style.color = '#c62828';
                errorDiv.style.border = '2px solid #ef5350';
            }
        }

        function clearAuthError() {
            const errorDiv = document.getElementById('authMessage');
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.style.display = 'none';
            }
        }

        // NEW SETTINGS FUNCTIONS
        function previewColors() {
            const primary = document.getElementById('primaryColor').value;
            const secondary = document.getElementById('secondaryColor').value;
            const bg = document.getElementById('backgroundColor').value;
            const card = document.getElementById('cardColor').value;
            const text = document.getElementById('textColor').value;
            
            // Apply colors to CSS variables (preview only, not saved)
            document.documentElement.style.setProperty('--accent-primary', primary);
            document.documentElement.style.setProperty('--accent-secondary', secondary);
            document.documentElement.style.setProperty('--bg-primary', bg);
            document.documentElement.style.setProperty('--bg-card', card);
            document.documentElement.style.setProperty('--text-primary', text);
            document.documentElement.style.setProperty('--button-primary', primary);
            
            // Derive other colors from primary
            document.documentElement.style.setProperty('--text-secondary', text);
            document.documentElement.style.setProperty('--text-meta', '#999');
            
            debugLog('🎨 Previewing colors (not saved)');
        }

        function saveCustomColors() {
            const primary = document.getElementById('primaryColor').value;
            const secondary = document.getElementById('secondaryColor').value;
            const bg = document.getElementById('backgroundColor').value;
            const card = document.getElementById('cardColor').value;
            const text = document.getElementById('textColor').value;
            
            // Apply colors to CSS variables
            document.documentElement.style.setProperty('--accent-primary', primary);
            document.documentElement.style.setProperty('--accent-secondary', secondary);
            document.documentElement.style.setProperty('--bg-primary', bg);
            document.documentElement.style.setProperty('--bg-card', card);
            document.documentElement.style.setProperty('--text-primary', text);
            document.documentElement.style.setProperty('--button-primary', primary);
            
            // Derive other colors from primary
            document.documentElement.style.setProperty('--text-secondary', text);
            document.documentElement.style.setProperty('--text-meta', '#999');
            
            // Save to appData (JSONBin)
            if (!appData.userSettings[currentUser]) {
                appData.userSettings[currentUser] = {};
            }
            appData.userSettings[currentUser].customColors = {
                primary, secondary, bg, card, text
            };
            
            saveData().then(saved => {
                if (saved) {
                    debugLog('🎨 Custom colors saved to JSONBin');
                    alert('✅ Colors saved successfully!');
                } else {
                    debugLog('❌ Failed to save custom colors');
                    alert('❌ Failed to save colors. Please try again.');
                }
            });
        }

        function applyCustomColors() {
            // This function is for compatibility - just preview
            previewColors();
        }

        function resetToDefaultColors() {
            if (!confirm('Reset all colors to default? This will save immediately.')) {
                return;
            }
            
            document.getElementById('primaryColor').value = '#667eea';
            document.getElementById('secondaryColor').value = '#764ba2';
            document.getElementById('backgroundColor').value = '#f5f7fa';
            document.getElementById('cardColor').value = '#ffffff';
            document.getElementById('textColor').value = '#2d3748';
            
            // Clear from JSONBin
            if (appData.userSettings[currentUser]) {
                delete appData.userSettings[currentUser].customColors;
            }
            
            saveData().then(saved => {
                if (saved) {
                    previewColors();
                    alert('✅ Colors reset to default!');
                } else {
                    alert('❌ Failed to reset colors');
                }
            });
        }

        function loadCustomColors() {
            // Get custom colors from JSONBin
            const colors = appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].customColors;
            
            if (colors) {
                document.getElementById('primaryColor').value = colors.primary;
                document.getElementById('secondaryColor').value = colors.secondary;
                document.getElementById('backgroundColor').value = colors.bg;
                document.getElementById('cardColor').value = colors.card;
                document.getElementById('textColor').value = colors.text;
                
                // Apply them
                document.documentElement.style.setProperty('--accent-primary', colors.primary);
                document.documentElement.style.setProperty('--accent-secondary', colors.secondary);
                document.documentElement.style.setProperty('--bg-primary', colors.bg);
                document.documentElement.style.setProperty('--bg-card', colors.card);
                document.documentElement.style.setProperty('--text-primary', colors.text);
                document.documentElement.style.setProperty('--button-primary', colors.primary);
                document.documentElement.style.setProperty('--text-secondary', colors.text);
                document.documentElement.style.setProperty('--text-meta', '#999');
                
                debugLog('🎨 Custom colors loaded from JSONBin');
            }
        }

        function toggleCompactMode() {
            const isCompact = document.getElementById('compactMode').checked;
            document.documentElement.setAttribute('data-compact', isCompact ? 'true' : 'false');
            
            // Save to JSONBin
            if (!appData.userSettings[currentUser]) {
                appData.userSettings[currentUser] = {};
            }
            appData.userSettings[currentUser].compactMode = isCompact;
            
            saveData().then(saved => {
                if (saved) {
                    debugLog('📦 Compact mode saved: ' + isCompact);
                }
            });
            
            loadAllContent();
        }

        function toggleDescriptions() {
            const showDesc = document.getElementById('showDescriptions').checked;
            document.documentElement.setAttribute('data-show-descriptions', showDesc ? 'true' : 'false');
            
            // Save to JSONBin
            if (!appData.userSettings[currentUser]) {
                appData.userSettings[currentUser] = {};
            }
            appData.userSettings[currentUser].showDescriptions = showDesc;
            
            saveData().then(saved => {
                if (saved) {
                    debugLog('📝 Show descriptions saved: ' + showDesc);
                }
            });
            
            loadAllContent();
        }

        function clearStarred() {
            if (confirm('Clear all your starred posts? This cannot be undone.')) {
                appData.stars[currentUser] = [];
                saveData().then(saved => {
                    if (saved) {
                        alert('✅ All starred posts cleared!');
                        loadAllContent();
                    }
                });
            }
        }

        function recheckNotifications() {
            debugLog('🔔 Manually rechecking deletion notifications...');
            
            // Get ALL deleted games for this user (including already notified ones)
            const userDeletedGames = appData.deletedGames.filter(d => d.creator === currentUser);
            
            if (userDeletedGames.length === 0) {
                alert('✅ No deleted posts found for your account.');
                return;
            }
            
            // Build HTML for all notifications
            let notificationsHTML = '';
            userDeletedGames.forEach((d, index) => {
                notificationsHTML += `
                    <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; border-radius: 8px;">
                        <div style="font-weight: 700; color: #f44336; font-size: 16px; margin-bottom: 8px;">
                            📌 "${escapeHtml(d.title)}"
                        </div>
                        <div style="color: #666; margin-bottom: 5px;">
                            <strong>Reason:</strong> ${escapeHtml(d.reason || 'No reason provided')}
                        </div>
                        <div style="color: #999; font-size: 13px;">
                            <strong>Deleted:</strong> ${new Date(d.dateDeleted).toLocaleDateString()}
                        </div>
                        ${d.notified ? '<div style="color: #999; font-size: 12px; margin-top: 5px; font-style: italic;">(Previously seen)</div>' : ''}
                    </div>
                `;
            });
            
            // Show modal
            document.getElementById('deletionNotificationContent').innerHTML = notificationsHTML;
            document.getElementById('deletionNotificationModal').style.display = 'flex';
            
            // Mark any unnotified ones
            const unnotified = userDeletedGames.filter(d => !d.notified);
            if (unnotified.length > 0) {
                window.pendingNotifications = unnotified;
            }
            
            debugLog('✅ Showing all ' + userDeletedGames.length + ' deleted posts');
        }

        function changePassword() {
            const oldPass = prompt('Enter current password:');
            if (!oldPass) return;
            
            const user = appData.users.find(u => u.username === currentUser);
            if (!user || user.password !== oldPass) {
                alert('❌ Incorrect current password!');
                return;
            }
            
            const newPass = prompt('Enter new password:');
            if (!newPass || newPass.length < 3) {
                alert('❌ Password must be at least 3 characters!');
                return;
            }
            
            const confirm = prompt('Confirm new password:');
            if (newPass !== confirm) {
                alert('❌ Passwords do not match!');
                return;
            }
            
            user.password = newPass;
            saveData().then(saved => {
                if (saved) {
                    alert('✅ Password changed successfully!');
                }
            });
        }

        function deleteAccount() {
            if (!confirm('⚠️ WARNING: Delete your account? This will delete ALL your posts and cannot be undone!')) {
                return;
            }
            
            const confirmText = prompt('Type your username to confirm deletion:');
            if (confirmText !== currentUser) {
                alert('❌ Username does not match. Account not deleted.');
                return;
            }
            
            // Delete user's posts
            appData.games = appData.games.filter(g => g.creator !== currentUser);
            
            // Delete user's stars
            delete appData.stars[currentUser];
            
            // Delete user account
            appData.users = appData.users.filter(u => u.username !== currentUser);
            
            saveData().then(saved => {
                if (saved) {
                    alert('✅ Account deleted successfully. You will be logged out.');
                    localStorage.removeItem('siteHubUser');
                    window.location.reload();
                }
            });
        }

        // GLOBAL FUNCTIONS FOR ONCLICK HANDLERS
        function doLogout() {
            debugLog('🚪 Logout clicked - logging out immediately');
            debugLog('🧹 Clearing localStorage...');
            localStorage.removeItem('siteHubUser');
            currentUser = null;
            isAdmin = false;
            
            // Hide app UI
            document.getElementById('userBar').style.display = 'none';
            document.getElementById('navTabs').style.display = 'none';
            document.getElementById('searchBar').style.display = 'none';
            document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
            
            debugLog('👋 Showing login screen...');
            showAuthModal();
        }

        function openSettingsModal() {
            // Update account info
            document.getElementById('settingsUsername').textContent = currentUser;
            document.getElementById('settingsAccountType').textContent = isAdmin ? 'Admin' : 'Regular User';
            
            // Get account created date
            const user = appData.users.find(u => u.username === currentUser);
            const createdDate = user && user.dateCreated ? new Date(user.dateCreated).toLocaleDateString() : 'Unknown';
            document.getElementById('settingsAccountDate').textContent = createdDate;
            
            // Load current settings from JSONBin
            const compactMode = (appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].compactMode) || false;
            const showDesc = (appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].showDescriptions) !== false; // Default true
            document.getElementById('compactMode').checked = compactMode;
            document.getElementById('showDescriptions').checked = showDesc;
            
            // Load custom colors
            loadCustomColors();
            
            // Load panic button settings
            loadPanicSettings();
            
            // Load comment settings
            const commentSort = (appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].commentSort) || 'newest';
            if (document.getElementById('commentSortOrder')) {
                document.getElementById('commentSortOrder').value = commentSort;
            }
            
            // Load notification preferences
            loadNotificationPrefs();
            
            // Load Phase 4 preferences
            loadThumbnailsPreference();
            loadThemePreset();
            
            // Show admin tools if admin
            if (isAdmin) {
                document.getElementById('adminTools').style.display = 'block';
                loadAdminReports();
            } else {
                document.getElementById('adminTools').style.display = 'none';
            }
            
            document.getElementById('settingsModal').classList.remove('hidden');
        }

        function closeSettingsModal() {
            document.getElementById('settingsModal').classList.add('hidden');
        }

        function exportData() {
            debugLog('📥 Exporting data...');
            
            const dataStr = JSON.stringify(appData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'site-hub-data-' + new Date().toISOString().split('T')[0] + '.json';
            link.click();
            URL.revokeObjectURL(url);
            
            debugLog('✅ Data exported');
            alert('✅ Data exported successfully!');
        }

        function showStats() {
            const totalGames = appData.games.length;
            const totalUsers = appData.users.length;
            const totalDeleted = appData.deletedGames.length;
            const myGames = appData.games.filter(g => g.creator === currentUser).length;
            const myStars = (appData.stars[currentUser] || []).length;
            const totalComments = appData.comments ? appData.comments.length : 0;
            
            // Count total stars across all users
            const totalStars = Object.values(appData.stars).reduce((sum, arr) => sum + arr.length, 0);
            
            // Find most starred post
            let mostStarredCount = 0;
            let mostStarredPost = null;
            appData.games.forEach(game => {
                const starCount = Object.values(appData.stars).filter(arr => arr.includes(game.id)).length;
                if (starCount > mostStarredCount) {
                    mostStarredCount = starCount;
                    mostStarredPost = game;
                }
            });
            
            const statsHTML = `
                <div style="padding: 15px; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); border-radius: 10px; color: white; text-align: center;">
                    <div style="font-size: 48px; font-weight: bold; margin-bottom: 5px;">${totalGames}</div>
                    <div style="font-size: 14px; opacity: 0.9;">Total Posts</div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div style="padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 10px; text-align: center;">
                        <div style="font-size: 32px; font-weight: bold; color: var(--accent-primary);">${totalUsers}</div>
                        <div style="font-size: 12px; color: #666;">👥 Users</div>
                    </div>
                    <div style="padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 10px; text-align: center;">
                        <div style="font-size: 32px; font-weight: bold; color: var(--accent-primary);">${totalStars}</div>
                        <div style="font-size: 12px; color: #666;">⭐ Stars</div>
                    </div>
                    <div style="padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 10px; text-align: center;">
                        <div style="font-size: 32px; font-weight: bold; color: var(--accent-primary);">${totalComments}</div>
                        <div style="font-size: 12px; color: #666;">💬 Comments</div>
                    </div>
                </div>
                
                <div style="padding: 15px; background: rgba(255, 152, 0, 0.1); border-radius: 10px; border-left: 4px solid #ff9800;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 5px;">📁 Your Posts</div>
                    <div style="font-size: 24px; font-weight: bold; color: #ff9800;">${myGames}</div>
                </div>
                
                <div style="padding: 15px; background: rgba(76, 175, 80, 0.1); border-radius: 10px; border-left: 4px solid #4caf50;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 5px;">⭐ Posts You Starred</div>
                    <div style="font-size: 24px; font-weight: bold; color: #4caf50;">${myStars}</div>
                </div>
                
                ${mostStarredPost ? `
                <div style="padding: 15px; background: rgba(244, 67, 54, 0.1); border-radius: 10px; border-left: 4px solid #f44336;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 5px;">🏆 Most Popular Post</div>
                    <div style="font-size: 16px; font-weight: bold; color: #f44336;">${escapeHtml(mostStarredPost.title)}</div>
                    <div style="font-size: 12px; color: #999;">${mostStarredCount} stars</div>
                </div>
                ` : ''}
                
                ${totalDeleted > 0 ? `
                <div style="padding: 15px; background: rgba(158, 158, 158, 0.1); border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #9e9e9e;">${totalDeleted}</div>
                    <div style="font-size: 12px; color: #666;">🗑️ Deleted Posts</div>
                </div>
                ` : ''}
            `;
            
            document.getElementById('statsContent').innerHTML = statsHTML;
            document.getElementById('statsModal').style.display = 'flex';
            
            debugLog('📊 Showing statistics modal');
        }

        function closeStatsModal() {
            document.getElementById('statsModal').style.display = 'none';
        }

        // PANIC BUTTON FUNCTIONS
        function togglePanicButton() {
            const enabled = document.getElementById('panicEnabled').checked;
            document.getElementById('panicSettings').style.display = enabled ? 'block' : 'none';
            
            if (!enabled) {
                // Disable panic button in JSONBin
                if (appData.userSettings[currentUser] && appData.userSettings[currentUser].panicButton) {
                    appData.userSettings[currentUser].panicButton.enabled = false;
                    saveData();
                }
                document.removeEventListener('keydown', handlePanicKey);
            }
        }

        function savePanicSettings() {
            const key = document.getElementById('panicKey').value;
            const url = document.getElementById('panicUrl').value;
            const mode = document.getElementById('panicMode').value;
            
            if (!url) {
                alert('⚠️ Please enter a redirect URL!');
                return;
            }
            
            // Validate URL
            try {
                new URL(url);
            } catch (e) {
                alert('⚠️ Please enter a valid URL (must start with http:// or https://)');
                return;
            }
            
            // Save to appData (JSONBin)
            if (!appData.userSettings[currentUser]) {
                appData.userSettings[currentUser] = {};
            }
            appData.userSettings[currentUser].panicButton = {
                enabled: true,
                key: key,
                url: url,
                mode: mode
            };
            
            saveData().then(saved => {
                if (saved) {
                    setupPanicButton();
                    alert('✅ Panic button saved! Press ' + key + ' to activate.');
                    debugLog('🚨 Panic button configured: ' + key + ' → ' + url + ' (' + mode + ')');
                } else {
                    alert('❌ Failed to save panic button settings');
                }
            });
        }

        function saveCommentSettings() {
            const sortOrder = document.getElementById('commentSortOrder').value;
            
            // Save to appData (JSONBin)
            if (!appData.userSettings[currentUser]) {
                appData.userSettings[currentUser] = {};
            }
            appData.userSettings[currentUser].commentSort = sortOrder;
            
            saveData().then(saved => {
                if (saved) {
                    debugLog('💬 Comment sort order saved: ' + sortOrder);
                } else {
                    debugLog('❌ Failed to save comment sort order');
                }
            });
        }

        function setupPanicButton() {
            // Get panic settings from JSONBin
            const settings = appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].panicButton;
            
            if (settings && settings.enabled && settings.key && settings.url) {
                document.addEventListener('keydown', handlePanicKey);
                debugLog('🚨 Panic button active: ' + settings.key);
            }
        }

        function handlePanicKey(e) {
            // Get panic settings from JSONBin
            const settings = appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].panicButton;
            
            if (!settings) return;
            
            if (e.key === settings.key || e.code === settings.key) {
                e.preventDefault();
                debugLog('🚨 PANIC! Redirecting to: ' + settings.url + ' (mode: ' + settings.mode + ')');
                
                if (settings.mode === 'newTab') {
                    // Open new tab with panic URL, then close this tab
                    window.open(settings.url, '_blank');
                    window.close();
                } else {
                    // Replace current tab (no history)
                    window.location.replace(settings.url);
                }
            }
        }

        function loadPanicSettings() {
            // Get panic settings from JSONBin
            const settings = appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].panicButton;
            
            if (settings) {
                document.getElementById('panicEnabled').checked = settings.enabled;
                document.getElementById('panicKey').value = settings.key || 'Escape';
                document.getElementById('panicUrl').value = settings.url || '';
                if (document.getElementById('panicMode')) {
                    document.getElementById('panicMode').value = settings.mode || 'newTab';
                }
                document.getElementById('panicSettings').style.display = settings.enabled ? 'block' : 'none';
            } else {
                // Default values
                document.getElementById('panicEnabled').checked = false;
                document.getElementById('panicKey').value = 'Escape';
                document.getElementById('panicUrl').value = '';
                if (document.getElementById('panicMode')) {
                    document.getElementById('panicMode').value = 'newTab';
                }
                document.getElementById('panicSettings').style.display = 'none';
            }
        }

        // COMMENT FUNCTIONS
        let currentCommentPostId = null;

        function filterProfanity(text) {
            let filtered = text;
            badWords.forEach(word => {
                const regex = new RegExp('\\b' + word + '\\b', 'gi');
                filtered = filtered.replace(regex, '***');
            });
            return filtered;
        }

        function openComments(postId) {
            currentCommentPostId = postId;
            const post = appData.games.find(g => g.id === postId);
            
            if (!post) return;
            
            document.getElementById('commentsTitle').textContent = '💬 Comments - ' + post.title;
            loadComments();
            document.getElementById('commentsModal').style.display = 'flex';
        }

        function closeComments() {
            document.getElementById('commentsModal').style.display = 'none';
            document.getElementById('commentInput').value = '';
            currentCommentPostId = null;
        }

        function loadComments() {
            if (!appData.comments) appData.comments = [];
            
            // Get sort order from JSONBin
            const sortOrder = (appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].commentSort) || 'newest';
            
            let postComments = appData.comments
                .filter(c => c.postId === currentCommentPostId);
            
            // Sort based on preference
            if (sortOrder === 'newest') {
                postComments.sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first
            } else {
                postComments.sort((a, b) => new Date(a.date) - new Date(b.date)); // Oldest first
            }
            
            const container = document.getElementById('commentsList');
            
            if (postComments.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">No comments yet. Be the first to comment!</div>';
                return;
            }
            
            container.innerHTML = postComments.map(comment => {
                const canDeleteComment = comment.username === currentUser || isAdmin;
                return `
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                            <div>
                                <span style="font-weight: 700; color: var(--accent-primary);">${escapeHtml(comment.username)}</span>
                                <span style="color: #999; font-size: 12px; margin-left: 10px;">${new Date(comment.date).toLocaleString()}</span>
                            </div>
                            ${canDeleteComment ? `<button onclick="deleteComment(${comment.id})" style="background: #f44336; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>` : ''}
                        </div>
                        <div style="color: #333; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(comment.text)}</div>
                    </div>
                `;
            }).join('');
        }

        async function postComment() {
            const text = document.getElementById('commentInput').value.trim();
            
            if (!text) {
                alert('⚠️ Please write a comment!');
                return;
            }
            
            // Filter profanity
            const filteredText = filterProfanity(text);
            
            if (!appData.comments) appData.comments = [];
            
            const newComment = {
                id: Date.now(),
                postId: currentCommentPostId,
                username: currentUser,
                text: filteredText,
                date: new Date().toISOString(),
                replyTo: currentReplyToComment ? currentReplyToComment.id : null,
                replyToUsername: currentReplyToComment ? currentReplyToComment.username : null
            };
            
            appData.comments.push(newComment);
            
            // Send notification to post creator
            const post = appData.games.find(g => g.id === currentCommentPostId);
            if (post && post.creator !== currentUser && shouldNotify(post.creator, 'comment')) {
                createNotification(
                    post.creator,
                    'comment',
                    `${currentUser} commented on your post "${post.title}"`,
                    currentCommentPostId
                );
            }
            
            // Send notification to person being replied to (if not the post creator)
            if (currentReplyToComment && currentReplyToComment.username !== currentUser && currentReplyToComment.username !== post.creator) {
                createNotification(
                    currentReplyToComment.username,
                    'comment',
                    `${currentUser} replied to your comment on "${post.title}"`,
                    currentCommentPostId
                );
            }
            
            if (await saveData()) {
                document.getElementById('commentInput').value = '';
                cancelReply(); // Clear reply state
                loadComments();
                loadAllContent(); // Refresh to update comment counts
                debugLog('💬 Comment posted');
            } else {
                alert('❌ Failed to post comment');
            }
        }

        async function deleteComment(commentId) {
            if (!appData.comments) return;
            
            appData.comments = appData.comments.filter(c => c.id !== commentId);
            
            if (await saveData()) {
                loadComments();
                loadAllContent(); // Refresh to update comment counts
                debugLog('🗑️ Comment deleted');
            }
        }

        function closeGameModalFn() {
            document.getElementById('gameModal').classList.add('hidden');
            document.getElementById('gameFrame').src = '';
        }

        function showReasonModal(game) {
            pendingDeleteGameId = game.id;
            document.getElementById('reasonGameTitle').textContent = game.title + ' by ' + game.creator;
            document.getElementById('deleteReason').value = '';
            document.getElementById('reasonModal').style.display = 'flex';
        }

        function cancelAdminDelete() {
            document.getElementById('reasonModal').style.display = 'none';
            pendingDeleteGameId = null;
            debugLog('❌ Admin delete cancelled');
        }

        function confirmAdminDelete() {
            const reason = document.getElementById('deleteReason').value.trim();
            if (!reason) {
                alert('Please enter a reason for deletion');
                return;
            }
            
            document.getElementById('reasonModal').style.display = 'none';
            
            if (pendingDeleteGameId) {
                performDelete(pendingDeleteGameId, reason);
                pendingDeleteGameId = null;
            }
        }

        function performDelete(gameId, adminReason) {
            debugLog('🗑️ Performing delete for game ID: ' + gameId);
            
            const game = appData.games.find(g => g.id === gameId);
            if (!game) {
                debugLog('❌ Game not found');
                return;
            }

            if (adminReason) {
                debugLog('🔒 Admin delete with reason: ' + adminReason);
                appData.deletedGames.push({
                    gameId: game.id,
                    title: game.title,
                    creator: game.creator,
                    deletedBy: 'admin',
                    reason: adminReason,
                    dateDeleted: new Date().toISOString(),
                    notified: false
                });
            }

            debugLog('🔄 Deleting game from array...');
            appData.games = appData.games.filter(g => g.id !== gameId);
            Object.keys(appData.stars).forEach(user => {
                if (appData.stars[user]) {
                    appData.stars[user] = appData.stars[user].filter(id => id !== gameId);
                }
            });

            debugLog('💾 Saving to database...');
            saveData().then(saved => {
                if (saved) {
                    debugLog('✅ Deleted successfully!');
                    loadAllContent();
                } else {
                    debugLog('❌ Failed to save');
                }
            });
        }

        function handleDelete(gameId) {
            debugLog('🗑️ Delete clicked for game ID: ' + gameId);
            
            const game = appData.games.find(g => g.id === gameId);
            if (!game) {
                alert('Post not found!');
                debugLog('❌ Game not found in appData');
                return;
            }

            debugLog('✅ Found game: ' + game.title);

            if (isAdmin && game.creator !== currentUser) {
                debugLog('🔒 Admin deleting another user\'s game - showing reason modal...');
                showReasonModal(game);
            } else {
                debugLog('👤 User deleting own game - no confirmation needed');
                performDelete(gameId, null);
            }
        }

        function handleOpen(gameId) {
            const game = appData.games.find(g => g.id === gameId);
            if (!game) return;
            
            currentGameUrl = game.url;
            document.getElementById('modalTitle').textContent = game.title;
            document.getElementById('gameFrame').src = game.url;
            document.getElementById('iframeError').classList.remove('show');
            
            // Populate quick actions
            const actionsContainer = document.getElementById('modalQuickActions');
            const isBookmarked = appData.bookmarks && appData.bookmarks[currentUser] && appData.bookmarks[currentUser].includes(gameId);
            
            actionsContainer.innerHTML = `
                <button onclick="toggleBookmark(${gameId}); window.location.reload();" style="background: ${isBookmarked ? '#4caf50' : '#1976d2'}; color: white; padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">
                    ${isBookmarked ? '✓ Saved' : '🔖 Save'}
                </button>
                <button onclick="openRatingModal(${gameId})" style="background: linear-gradient(135deg, #ffd700, #ffed4e); color: #333; padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">
                    ⭐ Rate
                </button>
                <button onclick="openComments(${gameId})" style="background: #2196f3; color: white; padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">
                    💬 Comments
                </button>
            `;
            
            document.getElementById('gameModal').classList.remove('hidden');
        }

        function handleStar(gameId) {
            if (!appData.stars[currentUser]) {
                appData.stars[currentUser] = [];
            }
            const stars = appData.stars[currentUser];
            const index = stars.indexOf(gameId);
            if (index > -1) {
                stars.splice(index, 1);
            } else {
                stars.push(gameId);
            }
            saveData().then(() => loadAllContent());
        }

        function handleLogout() {
            if (!confirm('Logout?')) return;
            localStorage.removeItem('siteHubUser');
            location.reload();
        }

        function handleFullscreen() {
            if (!currentGameUrl) return;
            const win = window.open('about:blank', '_blank');
            if (win) {
                win.document.write(`<!DOCTYPE html><html><head><style>body,html{margin:0;padding:0;overflow:hidden;height:100vh}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="${currentGameUrl}"></iframe></body></html>`);
                win.document.close();
            } else {
                alert('Please enable popups!');
            }
        }

        function handleVisitSite() {
            if (currentGameUrl) {
                window.open(currentGameUrl, '_blank');
            }
        }

        async function saveData() {
            try {
                const response = await fetch(JSONBIN_URL, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Master-Key': JSONBIN_API_KEY
                    },
                    body: JSON.stringify(appData)
                });
                return response.ok;
            } catch (error) {
                return false;
            }
        }

        async function loadData() {
            debugLog('⏳ Loading data from JSONBin...');
            try {
                const response = await fetch(JSONBIN_URL + '/latest', {
                    headers: { 'X-Master-Key': JSONBIN_API_KEY }
                });
                
                debugLog('📡 Response status: ' + response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    debugLog('✅ Data received successfully');
                    
                    if (Array.isArray(data.record)) {
                        appData = { 
                            users: [], 
                            games: data.record, 
                            stars: {}, 
                            deletedGames: [], 
                            comments: [], 
                            userSettings: {},
                            ratings: {},
                            profiles: {},
                            follows: {},
                            notifications: [],
                            tags: {},
                            collections: {},
                            reactions: {},
                            views: {},
                            recentlyViewed: {},
                            badges: {},
                            reports: [],
                            verifiedUsers: [],
                            featuredPosts: []
                        };
                    } else {
                        appData = data.record;
                        if (!appData.deletedGames) appData.deletedGames = [];
                        if (!appData.users) appData.users = [];
                        if (!appData.stars) appData.stars = {};
                        if (!appData.games) appData.games = [];
                        if (!appData.comments) appData.comments = [];
                        if (!appData.userSettings) appData.userSettings = {};
                        if (!appData.ratings) appData.ratings = {};
                        if (!appData.profiles) appData.profiles = {};
                        if (!appData.follows) appData.follows = {};
                        if (!appData.notifications) appData.notifications = [];
                        if (!appData.tags) appData.tags = {};
                        if (!appData.collections) appData.collections = {};
                        if (!appData.reactions) appData.reactions = {};
                        if (!appData.views) appData.views = {};
                        if (!appData.recentlyViewed) appData.recentlyViewed = {};
                        if (!appData.badges) appData.badges = {};
                        if (!appData.reports) appData.reports = [];
                        if (!appData.verifiedUsers) appData.verifiedUsers = [];
                        if (!appData.featuredPosts) appData.featuredPosts = [];
                    }
                    
                    debugLog('🎮 Games loaded: ' + appData.games.length);
                    debugLog('👥 Users loaded: ' + appData.users.length);
                } else {
                    debugLog('❌ Fetch failed with status: ' + response.status);
                }
            } catch (error) {
                debugLog('❌ Error: ' + error.message);
            }
        }

        function loadTheme() {
            const savedTheme = localStorage.getItem('siteHubTheme') || 'default';
            const savedInverted = localStorage.getItem('siteHubInverted') === 'true';
            document.documentElement.setAttribute('data-theme', savedTheme);
            if (savedInverted) document.documentElement.setAttribute('data-inverted', 'true');
            const cb = document.getElementById('invertColors');
            if (cb) cb.checked = savedInverted;
        }

        function changeTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('siteHubTheme', theme);
            // Highlight active theme
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.style.borderColor = '';
            });
        }

        function toggleInvert() {
            const isInverted = document.getElementById('invertColors').checked;
            if (isInverted) {
                document.documentElement.setAttribute('data-inverted', 'true');
                localStorage.setItem('siteHubInverted', 'true');
            } else {
                document.documentElement.removeAttribute('data-inverted');
                localStorage.setItem('siteHubInverted', 'false');
            }
        }

        function updateActiveTheme(theme) {
            document.querySelectorAll('.theme-option').forEach(option => {
                option.classList.remove('active');
                if (option.getAttribute('data-theme') === theme) {
                    option.classList.add('active');
                }
            });
        }

        function switchAuthTab(tab) {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            if (tab === 'login') {
                document.querySelectorAll('.auth-tab')[0].classList.add('active');
                document.getElementById('loginForm').classList.add('active');
            } else {
                document.querySelectorAll('.auth-tab')[1].classList.add('active');
                document.getElementById('signupForm').classList.add('active');
            }
        }

        function checkAuth() {
            const savedUser = localStorage.getItem('siteHubUser');
            alert('Checking auth. Saved user: ' + (savedUser || 'NONE'));
            
            if (savedUser) {
                currentUser = savedUser;
                isAdmin = (savedUser === 'admin');
                alert('Logged in as: ' + currentUser + (isAdmin ? ' (ADMIN)' : ''));
                showApp();
            } else {
                alert('No saved user - showing login screen');
                showAuthModal();
            }
        }

        function showAuthModal() {
            clearAuthError();
            document.getElementById('authModal').classList.remove('hidden');
            document.getElementById('userBar').style.display = 'none';
            document.getElementById('navTabs').style.display = 'none';
            document.getElementById('searchBar').style.display = 'none';
            
            // Reset forms
            document.getElementById('loginForm').reset();
            document.getElementById('signupForm').reset();
            
            // Show login tab by default
            switchAuthTab('login');
        }

        function hideAuthModal() {
            document.getElementById('authModal').classList.add('hidden');
        }

        function showApp() {
            debugLog('🎉 showApp called - user: ' + currentUser);
            
            hideAuthModal();
            document.getElementById('userBar').style.display = 'flex';
            document.getElementById('navTabs').style.display = 'flex';
            document.getElementById('searchBar').style.display = 'block';
            document.getElementById('currentUsername').textContent = currentUser + (isAdmin ? ' (ADMIN)' : '');
            
            // Load saved preferences from JSONBin
            const compactMode = (appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].compactMode) || false;
            const showDesc = (appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].showDescriptions) !== false; // Default true
            document.documentElement.setAttribute('data-compact', compactMode ? 'true' : 'false');
            document.documentElement.setAttribute('data-show-descriptions', showDesc ? 'true' : 'false');
            
            // Load user settings from JSONBin
            loadCustomColors();
            setupPanicButton();
            updateNotificationBadge();
            
            // Load Phase 4 preferences
            loadThumbnailsPreference();
            loadThemePreset();
            
            // Check for deletion notifications (non-admin users only)
            if (!isAdmin) {
                checkDeletionNotifications();
            }
            
            debugLog('📱 Calling switchTab(browse)...');
            switchTab('browse');
            
            debugLog('📚 Calling loadAllContent()...');
            loadAllContent();
        }

        function checkDeletionNotifications() {
            const userDeletedGames = appData.deletedGames.filter(d => 
                d.creator === currentUser && !d.notified
            );
            
            if (userDeletedGames.length > 0) {
                debugLog('⚠️ Found ' + userDeletedGames.length + ' deleted game notifications');
                
                // Build HTML for notifications
                let notificationsHTML = '';
                userDeletedGames.forEach((d, index) => {
                    notificationsHTML += `
                        <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; border-radius: 8px;">
                            <div style="font-weight: 700; color: #f44336; font-size: 16px; margin-bottom: 8px;">
                                📌 "${escapeHtml(d.title)}"
                            </div>
                            <div style="color: #666; margin-bottom: 5px;">
                                <strong>Reason:</strong> ${escapeHtml(d.reason || 'No reason provided')}
                            </div>
                            <div style="color: #999; font-size: 13px;">
                                <strong>Deleted:</strong> ${new Date(d.dateDeleted).toLocaleDateString()}
                            </div>
                        </div>
                    `;
                });
                
                // Show modal
                document.getElementById('deletionNotificationContent').innerHTML = notificationsHTML;
                document.getElementById('deletionNotificationModal').style.display = 'flex';
                
                // Store the games to mark as notified when user closes modal
                window.pendingNotifications = userDeletedGames;
                
                debugLog('✅ Showing deletion notification modal');
            }
        }

        function closeDeletionNotification() {
            // Mark as notified
            if (window.pendingNotifications) {
                window.pendingNotifications.forEach(d => d.notified = true);
                saveData();
                window.pendingNotifications = null;
                debugLog('✅ Notifications marked as read');
            }
            
            // Close modal
            document.getElementById('deletionNotificationModal').style.display = 'none';
        }

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthError();
            
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            
            // Check for admin (case-insensitive)
            if (username.toLowerCase() === 'admin' && password === 'sites-admin') {
                currentUser = 'admin'; // Always use lowercase 'admin'
                isAdmin = true;
                localStorage.setItem('siteHubUser', 'admin');
                showApp();
                return;
            }
            
            // Find user (case-insensitive username match)
            const user = appData.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
            if (user) {
                currentUser = user.username; // Use the actual stored username (preserves original case)
                isAdmin = false;
                localStorage.setItem('siteHubUser', user.username);
                showApp();
            } else {
                showAuthError('Incorrect username or password');
            }
        });

        document.getElementById('signupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthError();
            
            let username = document.getElementById('signupUsername').value;
            const password = document.getElementById('signupPassword').value;
            
            // Replace spaces with underscores
            username = username.replace(/\s+/g, '_');
            
            // Check if username is "admin" (case-insensitive)
            if (username.toLowerCase() === 'admin') {
                showAuthError('Cannot use reserved username "admin"');
                return;
            }
            
            // Check for profanity
            if (containsProfanity(username)) {
                showAuthError('❌ Profanity detected in username! Please choose a different username.');
                return;
            }
            
            // Check if username exists (case-insensitive)
            if (appData.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
                showAuthError('Username already exists');
                return;
            }
            
            appData.users.push({ 
                username, 
                password,
                dateCreated: new Date().toISOString()
            });
            appData.stars[username] = [];
            
            if (await saveData()) {
                currentUser = username;
                isAdmin = false;
                localStorage.setItem('siteHubUser', username);
                showApp();
            } else {
                showAuthError('Failed to create account. Please try again.');
            }
        });

        function switchTab(tab) {
            debugLog('🔀 Switching to tab: ' + tab);
            
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => {
                c.classList.remove('active');
                c.style.display = 'none';
            });
            
            // Hide/show search bar based on tab
            const searchBar = document.getElementById('searchBar');
            if (tab === 'add') {
                searchBar.style.display = 'none';
            } else {
                searchBar.style.display = 'block';
            }
            
            // Find which button was clicked and activate it
            const buttons = document.querySelectorAll('.nav-tab');
            const tabMap = ['browse', 'mygames', 'starred', 'bookmarks', 'collections', 'leaderboards', 'add'];
            const index = tabMap.indexOf(tab);
            if (index >= 0 && buttons[index]) {
                buttons[index].classList.add('active');
            }
            
            // Handle trending tab specially (uses browse tab element but loads trending data)
            if (tab === 'trending') {
                const browseTab = document.getElementById('browseTab');
                if (browseTab) {
                    browseTab.classList.add('active');
                    browseTab.style.display = 'block';
                }
                loadTrending();
                return;
            }
            
            const tabElement = document.getElementById(tab + 'Tab');
            if (tabElement) {
                tabElement.classList.add('active');
                tabElement.style.display = 'block';
                debugLog('✅ Tab element shown: ' + tab + 'Tab');
            } else {
                debugLog('❌ Tab element not found: ' + tab + 'Tab');
            }
            
            if (tab === 'browse') loadBrowse();
            if (tab === 'mygames') loadMyGames();
            if (tab === 'starred') loadStarred();
            if (tab === 'add') loadEditablePostsList();
        }

        function loadEditablePostsList() {
            debugLog('📝 Loading editable posts list');
            const container = document.getElementById('editablePostsList');
            const myPosts = appData.games.filter(g => g.creator === currentUser);
            
            if (myPosts.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-meta); background: var(--bg-card); border-radius: 8px;">You have no posts to edit yet.</div>';
                return;
            }
            
            container.innerHTML = myPosts.map(post => {
                // Count URLs
                let urlCount = 1;
                if (post.urls && Array.isArray(post.urls)) {
                    urlCount = post.urls.length;
                }
                
                return `
                    <div onclick="startEditPost(${post.id})" style="padding: 15px; background: var(--bg-card); border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.borderColor='var(--accent-primary)'" onmouseout="this.style.borderColor='#e0e0e0'">
                        <div style="font-weight: 600; color: var(--accent-primary); margin-bottom: 5px;">✏️ ${escapeHtml(post.title)}</div>
                        <div style="font-size: 12px; color: var(--text-meta);">🔗 ${urlCount} website${urlCount > 1 ? 's' : ''}</div>
                    </div>
                `;
            }).join('');
        }

        function startEditPost(gameId) {
            debugLog('✏️ Starting edit for post ID: ' + gameId);
            const post = appData.games.find(g => g.id === gameId);
            if (!post) return;
            
            // Pre-fill form
            document.getElementById('gameTitle').value = post.title;
            document.getElementById('gameDescription').value = post.description || '';
            document.getElementById('editingGameId').value = post.id;
            
            // Load URLs (handle both old single-URL and new multi-URL formats)
            currentPostUrls = [];
            if (post.urls && Array.isArray(post.urls)) {
                // New format: multiple URLs
                currentPostUrls = [...post.urls];
            } else if (post.url) {
                // Old format: single URL - convert to new format
                currentPostUrls = [{ url: post.url, label: 'Website' }];
            }
            renderUrlsList();
            
            // Load allowComments setting (default to true for backward compatibility)
            document.getElementById('allowComments').checked = post.allowComments !== false;
            
            // Load buttonText if it exists
            if (document.getElementById('postButtonText')) {
                document.getElementById('postButtonText').value = post.buttonText || 'View _ websites';
            }
            
            // Load tags if they exist
            currentPostTags = appData.tags[post.id] ? [...appData.tags[post.id]] : [];
            renderCurrentTags();
            
            // Update UI
            document.getElementById('addFormTitle').textContent = '✏️ Editing: ' + post.title;
            document.getElementById('submitBtn').textContent = 'Update Post';
            document.getElementById('cancelEditBtn').style.display = 'block';
            
            // Scroll to top of form
            document.getElementById('addFormTitle').scrollIntoView({ behavior: 'smooth' });
            
            debugLog('✅ Form pre-filled for editing (' + currentPostUrls.length + ' URLs)');
        }

        function addUrlToPost() {
            const urlInput = document.getElementById('newUrlInput');
            const labelInput = document.getElementById('newUrlLabel');
            let url = urlInput.value.trim();
            const label = labelInput.value.trim() || 'Website';
            
            if (!url) {
                alert('Please enter a URL');
                return;
            }
            
            // Normalize URL (add https:// if missing)
            url = normalizeUrl(url);
            
            // Validate URL format
            try {
                new URL(url);
            } catch (e) {
                alert('Please enter a valid URL (e.g., google.com or https://google.com)');
                return;
            }
            
            // Add to temporary array
            currentPostUrls.push({ url, label });
            
            // Clear inputs
            urlInput.value = '';
            labelInput.value = '';
            
            // Update display
            renderUrlsList();
            
            debugLog('➕ Added URL to post: ' + label + ' - ' + url);
        }

        function removeUrlFromPost(index) {
            debugLog('🗑️ Removing URL at index: ' + index);
            currentPostUrls.splice(index, 1);
            renderUrlsList();
        }

        function renderUrlsList() {
            const container = document.getElementById('urlsList');
            const buttonTextSection = document.getElementById('buttonTextSection');
            
            if (currentPostUrls.length === 0) {
                container.innerHTML = '<div style="color: var(--text-meta); font-style: italic; padding: 20px; text-align: center;">No websites added yet</div>';
                // Hide button text section
                if (buttonTextSection) buttonTextSection.style.display = 'none';
                return;
            }
            
            container.innerHTML = currentPostUrls.map((item, index) => `
                <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: white; border: 2px solid #e0e0e0; border-radius: 8px; margin-bottom: 8px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: var(--accent-primary);">${escapeHtml(item.label)}</div>
                        <div style="font-size: 12px; color: var(--text-meta); word-break: break-all;">${escapeHtml(item.url)}</div>
                    </div>
                    <button type="button" onclick="removeUrlFromPost(${index})" style="background: #f44336; color: white; padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; white-space: nowrap;">🗑️</button>
                </div>
            `).join('');
            
            // Show/hide button text section based on URL count
            if (buttonTextSection) {
                if (currentPostUrls.length >= 3) {
                    buttonTextSection.style.display = 'block';
                } else {
                    buttonTextSection.style.display = 'none';
                }
            }
        }

        function cancelEdit() {
            debugLog('❌ Cancelling edit');
            document.getElementById('addGameForm').reset();
            document.getElementById('editingGameId').value = '';
            document.getElementById('addFormTitle').textContent = 'Add a New Post';
            document.getElementById('submitBtn').textContent = 'Save Post';
            document.getElementById('cancelEditBtn').style.display = 'none';
            currentPostUrls = [];
            currentPostTags = [];
            renderUrlsList();
            renderCurrentTags();
        }

        function loadAllContent() {
            loadBrowse();
            loadMyGames();
            loadStarred();
            loadBookmarks();
            loadCollections();
            loadLeaderboards();
        }

        function loadBrowse() {
            debugLog('📊 loadBrowse called, games: ' + appData.games.length);
            
            const gallery = document.getElementById('browseGallery');
            debugLog('📦 Gallery element found: ' + (gallery ? 'YES' : 'NO'));
            
            // Show debug info on page
            if (appData.games.length === 0) {
                gallery.innerHTML = '<div class="no-games">No posts yet! (Debug: Loaded ' + appData.games.length + ' games from database)</div>';
                debugLog('⚠️ No games to display');
                return;
            }
            
            // Apply sorting
            let sortedGames = sortGames(appData.games);
            
            // Apply advanced filters (Phase 4)
            sortedGames = applyFiltersToGames(sortedGames);
            
            // Phase 5: Separate pinned and unpinned posts
            const pinnedIds = appData.pinnedPosts || [];
            const pinnedGames = sortedGames.filter(g => pinnedIds.includes(g.id));
            const unpinnedGames = sortedGames.filter(g => !pinnedIds.includes(g.id));
            sortedGames = [...pinnedGames, ...unpinnedGames]; // Pinned posts first
            
            debugLog('🎨 Creating HTML for ' + sortedGames.length + ' games...');
            try {
                const cardsHTML = sortedGames.map(game => {
                    debugLog('  - Creating card for: ' + game.title);
                    return createGameCard(game);
                }).join('');
                
                debugLog('✅ HTML created, length: ' + cardsHTML.length + ' chars');
                gallery.innerHTML = cardsHTML;
                debugLog('✅ Gallery innerHTML set successfully');
            } catch (error) {
                debugLog('❌ Error creating cards: ' + error.message);
            }
        }

        function loadMyGames() {
            const gallery = document.getElementById('myGamesGallery');
            const myGames = appData.games.filter(g => g.creator === currentUser);
            if (myGames.length === 0) {
                gallery.innerHTML = '<div class="no-games">You haven\'t created any posts yet!</div>';
                return;
            }
            gallery.innerHTML = myGames.map(game => createGameCard(game)).join('');
        }

        function loadStarred() {
            const gallery = document.getElementById('starredGallery');
            const starredIds = appData.stars[currentUser] || [];
            const starredGames = appData.games.filter(g => starredIds.includes(g.id));
            if (starredGames.length === 0) {
                gallery.innerHTML = '<div class="no-games">No starred posts yet!</div>';
                return;
            }
            gallery.innerHTML = starredGames.map(game => createGameCard(game)).join('');
        }

        function createGameCard(game) {
            const starredIds = appData.stars[currentUser] || [];
            const isStarred = starredIds.includes(game.id);
            const canDelete = game.creator === currentUser || isAdmin;
            const creator = game.creator || 'Anonymous';
            const date = game.dateAdded ? new Date(game.dateAdded).toLocaleDateString() : 'Unknown';
            
            // Calculate star count
            const starCount = Object.values(appData.stars).filter(arr => arr.includes(game.id)).length;
            
            // Calculate comment count
            const commentCount = appData.comments ? appData.comments.filter(c => c.postId === game.id).length : 0;
            
            // Get URLs (handle both old single-URL and new multi-URL formats)
            let urls = [];
            if (game.urls && Array.isArray(game.urls)) {
                urls = game.urls;
            } else if (game.url) {
                urls = [{ url: game.url, label: 'Open' }];
            }
            
            // Create buttons based on URL count
            let urlButtons = '';
            if (urls.length <= 2) {
                // Show individual buttons for 1-2 URLs
                urlButtons = urls.map((urlItem, index) => 
                    `<button class="open-btn" onclick="handleOpenUrl('${escapeHtml(urlItem.url)}')" style="grid-column: span 1;">
                        🚀 ${escapeHtml(urlItem.label)}
                    </button>`
                ).join('');
            } else {
                // Get custom button text from post (or use default)
                const buttonTemplate = game.buttonText || 'View _ websites';
                const buttonText = buttonTemplate.replace('_', urls.length);
                
                debugLog('🔘 Using button text: "' + buttonText + '" for ' + urls.length + ' URLs (template: "' + buttonTemplate + '")');
                
                // Show single button for 3+ URLs
                urlButtons = `<button class="open-btn" onclick="showWebsiteSelector(${game.id})" style="grid-column: 1 / -1;">
                    🌐 ${escapeHtml(buttonText)}
                </button>`;
            }
            
            // Handle long descriptions
            const description = game.description || 'No description';
            const maxLength = 150;
            let descriptionHTML = '';
            
            if (description.length > maxLength) {
                const truncated = description.substring(0, maxLength);
                descriptionHTML = `
                    <p id="desc-${game.id}" style="margin-bottom: 5px;">${escapeHtml(truncated)}...</p>
                    <button onclick="toggleDescription(${game.id})" style="background: none; border: none; color: var(--accent-primary); text-decoration: underline; cursor: pointer; padding: 0; font-size: 14px; font-weight: 600;">View More</button>
                `;
            } else {
                descriptionHTML = `<p>${escapeHtml(description)}</p>`;
            }
            
            return `
                <div class="game-card" data-post-id="${game.id}">
                    ${(() => {
                        const isPinned = appData.pinnedPosts && appData.pinnedPosts.includes(game.id);
                        return isPinned ? `<div style="position:absolute;top:10px;right:10px;background:#ff5722;color:white;padding:5px 12px;border-radius:15px;font-weight:bold;font-size:12px;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.3);">📌 PINNED</div>` : '';
                    })()}
                    ${renderThumbnail(game)}
                    <h3>${escapeHtml(game.title)}</h3>
                    ${descriptionHTML}
                    <p class="game-meta">By <span onclick="openUserProfile('${escapeHtml(creator)}')" style="cursor: pointer; color: var(--accent-primary); font-weight: 600; text-decoration: underline;">${escapeHtml(creator)}</span> ${renderVerifiedBadge(creator)}${renderLevelBadge(creator)} • ${date}</p>
                    ${urls.length > 1 ? '<p class="game-meta" style="color: var(--accent-primary);">📌 ' + urls.length + ' websites</p>' : ''}
                    
                    <!-- Rating Display -->
                    <div style="margin: 10px 0;">
                        ${renderStarDisplay(game.id)}
                    </div>
                    
                    <!-- Reactions (Phase 3) -->
                    ${renderReactions(game.id)}
                    
                    <!-- Tags Display -->
                    ${renderPostTags(game.id) ? '<div style="margin: 10px 0;">' + renderPostTags(game.id) + '</div>' : ''}
                    
                    <div class="game-meta" style="display: flex; gap: 15px; color: var(--accent-primary); font-weight: 600;">
                        <span>💬 ${commentCount} comment${commentCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="card-buttons" style="grid-template-columns: repeat(${urls.length > 2 ? '2' : urls.length}, 1fr);">
                        ${urlButtons}
                        
                        <!-- Main Quick Actions Row -->
                        <button onclick="openRatingModal(${game.id})" style="grid-column: 1 / -1; background: linear-gradient(135deg, #ffd700, #ffed4e); color: #333; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            ⭐ Rate
                        </button>
                        
                        ${(() => {
                            const isBookmarked = appData.bookmarks && appData.bookmarks[currentUser] && appData.bookmarks[currentUser].includes(game.id);
                            return `<button onclick="toggleBookmark(${game.id})" style="background: ${isBookmarked ? '#4caf50' : '#1976d2'}; color: white; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">${isBookmarked ? '✓ Saved' : '🔖 Save'}</button>`;
                        })()}
                        
                        ${(game.allowComments !== false) ? `<button onclick="openComments(${game.id})" style="background: #2196f3; color: white; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">💬 Comments (${commentCount})</button>` : ''}
                        
                        <!-- More Button -->
                        <button onclick="toggleMoreActions(${game.id})" style="grid-column: 1 / -1; background: linear-gradient(135deg, #00acc1, #00bcd4); color: white; padding: 12px; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; box-shadow: 0 3px 8px rgba(0,188,212,0.3);">
                            ⋯ More Actions
                        </button>
                        
                        <!-- Hidden More Section -->
                        <div id="more-${game.id}" style="display: none; grid-column: 1 / -1; margin-top: 5px;">
                            <div style="display: grid; gap: 8px;">
                                ${(isAdmin || game.creator === currentUser) ? (() => {
                                    const isPinned = appData.pinnedPosts && appData.pinnedPosts.includes(game.id);
                                    return `<button onclick="togglePinPost(${game.id})" style="background: ${isPinned ? '#ff5722' : '#1976d2'}; color: white; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%;">${isPinned ? '📍 Unpin' : '📌 Pin'}</button>`;
                                })() : ''}
                                
                                <button onclick="openAddToCollection(${game.id})" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                    📂 Add to Collection
                                </button>
                                
                                ${game.creator === currentUser ? `<button onclick="openAnalyticsModal(${game.id})" style="background: linear-gradient(135deg, #4caf50, #45a049); color: white; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">📊 Analytics</button>` : ''}
                                
                                <button onclick="openReportModal(${game.id})" style="background: #ff9800; color: white; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                    🚨 Report
                                </button>
                                
                                ${canDelete ? `<button class="delete-btn" onclick="handleDelete(${game.id})" style="width: 100%;">🗑️ Delete</button>` : ''}
                            </div>
                        </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        function toggleDescription(gameId) {
            const game = appData.games.find(g => g.id === gameId);
            if (!game) return;
            
            const descElement = document.getElementById('desc-' + gameId);
            const button = event.target;
            const description = game.description || 'No description';
            const maxLength = 150;
            
            if (button.textContent === 'View More') {
                // Expand
                descElement.textContent = description;
                button.textContent = 'View Less';
            } else {
                // Collapse
                const truncated = description.substring(0, maxLength);
                descElement.textContent = truncated + '...';
                button.textContent = 'View More';
            }
        }

        function showWebsiteSelector(gameId) {
            debugLog('🌐 Opening website selector for game ID: ' + gameId);
            const game = appData.games.find(g => g.id === gameId);
            if (!game) return;
            
            // Get URLs
            let urls = [];
            if (game.urls && Array.isArray(game.urls)) {
                urls = game.urls;
            } else if (game.url) {
                urls = [{ url: game.url, label: 'Website' }];
            }
            
            // Update modal title
            document.getElementById('selectorTitle').textContent = 'Choose Website - ' + game.title;
            
            // Create website list
            const container = document.getElementById('websitesList');
            container.innerHTML = urls.map((urlItem, index) => `
                <div onclick="handleOpenUrl('${escapeHtml(urlItem.url)}'); closeWebsiteSelector();" style="padding: 15px; background: var(--bg-card); border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.borderColor='var(--accent-primary)'; this.style.background='rgba(102, 126, 234, 0.05)'" onmouseout="this.style.borderColor='#e0e0e0'; this.style.background='var(--bg-card)'">
                    <div style="font-weight: 600; color: var(--accent-primary); margin-bottom: 5px;">🚀 ${escapeHtml(urlItem.label)}</div>
                    <div style="font-size: 12px; color: var(--text-meta); word-break: break-all;">${escapeHtml(urlItem.url)}</div>
                </div>
            `).join('');
            
            // Show modal
            document.getElementById('websiteSelectorModal').style.display = 'flex';
        }

        function closeWebsiteSelector() {
            document.getElementById('websiteSelectorModal').style.display = 'none';
        }

        function closeIframeHelp() {
            document.getElementById('iframeHelpOverlay').style.display = 'none';
        }

        function handleOpenUrl(url) {
            currentGameUrl = url;
            // Extract title from URL or use URL as title
            const urlObj = new URL(url);
            const title = urlObj.hostname.replace('www.', '');
            
            document.getElementById('modalTitle').textContent = title;
            const iframe = document.getElementById('gameFrame');
            
            // Show help overlay again for each new URL
            document.getElementById('iframeHelpOverlay').style.display = 'block';
            
            // Set iframe source
            iframe.src = url;
            
            document.getElementById('gameModal').classList.remove('hidden');
        }

        document.getElementById('addGameForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('gameTitle').value;
            const description = document.getElementById('gameDescription').value || 'No description provided';
            const allowComments = document.getElementById('allowComments').checked;
            const buttonText = document.getElementById('postButtonText').value || 'View _ websites';
            const editingId = document.getElementById('editingGameId').value;
            
            // Check for profanity in title and description
            if (containsProfanity(title)) {
                alert('❌ Profanity detected in title! Please remove inappropriate language.');
                return;
            }
            
            if (containsProfanity(description)) {
                alert('❌ Profanity detected in description! Please remove inappropriate language.');
                return;
            }
            
            // Validate at least one URL
            if (currentPostUrls.length === 0) {
                alert('⚠️ Please add at least one URL before saving!');
                return;
            }
            
            if (editingId) {
                // EDIT MODE - Update existing post
                debugLog('✏️ Updating post ID: ' + editingId);
                const gameIndex = appData.games.findIndex(g => g.id === parseInt(editingId));
                
                if (gameIndex !== -1) {
                    appData.games[gameIndex].title = title;
                    appData.games[gameIndex].description = description;
                    appData.games[gameIndex].urls = currentPostUrls;
                    appData.games[gameIndex].allowComments = allowComments;
                    appData.games[gameIndex].buttonText = currentPostUrls.length >= 3 ? buttonText : undefined;
                    // Keep old 'url' field for backward compatibility (use first URL)
                    appData.games[gameIndex].url = currentPostUrls[0].url;
                    
                    // Save tags
                    if (currentPostTags.length > 0) {
                        appData.tags[parseInt(editingId)] = [...currentPostTags];
                    } else {
                        delete appData.tags[parseInt(editingId)];
                    }
                    
                    if (await saveData()) {
                        debugLog('✅ Post updated successfully');
                        alert('✅ Post updated!');
                        cancelEdit();
                        loadAllContent();
                        loadEditablePostsList();
                    } else {
                        debugLog('❌ Failed to update post');
                        alert('❌ Failed to update post');
                    }
                }
            } else {
                // CREATE MODE - Add new post
                debugLog('➕ Creating new post with ' + currentPostUrls.length + ' URLs');
                const thumbnailUrl = document.getElementById('thumbnailUrl').value.trim();
                
                const newGame = {
                    id: Date.now(),
                    title,
                    description,
                    urls: currentPostUrls,
                    url: currentPostUrls[0].url, // For backward compatibility
                    creator: currentUser,
                    dateAdded: new Date().toISOString(),
                    allowComments: allowComments,
                    buttonText: currentPostUrls.length >= 3 ? buttonText : undefined,
                    thumbnail: thumbnailUrl || undefined
                };
                
                appData.games.unshift(newGame);
                
                // Save tags if any
                if (currentPostTags.length > 0) {
                    appData.tags[newGame.id] = [...currentPostTags];
                }
                
                if (await saveData()) {
                    debugLog('✅ Post created successfully');
                    
                    // Check and award badges
                    checkAndAwardBadges(currentUser);
                    awardXP(currentUser, XP_REWARDS['create_post'], 'Created a post');
                    
                    alert('✅ Post added!');
                    document.getElementById('addGameForm').reset();
                    document.getElementById('allowComments').checked = true; // Reset to default
                    document.getElementById('thumbnailUrl').value = '';
                    document.getElementById('thumbnailPreview').style.display = 'none';
                    currentPostUrls = [];
                    currentPostTags = [];
                    renderUrlsList();
                    renderCurrentTags();
                    loadAllContent();
                    loadEditablePostsList();
                } else {
                    debugLog('❌ Failed to create post');
                    alert('❌ Failed to add post');
                }
            }
        });

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ========================================
        // PHASE 1 FEATURES - Sites v4.0
        // ========================================

        // Global variables for new features
        let currentRatingPostId = null;
        let selectedRating = 0;
        let currentPostTags = [];

        // ========================================
        // ========================================
        // 1. NOTIFICATION FUNCTIONS
        // ========================================

        function createNotification(user, type, message, link = null) {
            const notification = {
                id: Date.now(),
                user: user,
                type: type,
                message: message,
                link: link,
                read: false,
                date: new Date().toISOString()
            };
            
            appData.notifications.push(notification);
            saveData();
            updateNotificationBadge();
            debugLog('🔔 Notification created for ' + user + ': ' + message);
        }

        function toggleNotifications() {
            const dropdown = document.getElementById('notificationDropdown');
            if (dropdown.style.display === 'none' || dropdown.style.display === '') {
                dropdown.style.display = 'block';
                loadNotificationsList();
            } else {
                dropdown.style.display = 'none';
            }
        }

        function loadNotificationsList() {
            const list = document.getElementById('notificationList');
            const userNotifications = appData.notifications
                .filter(n => n.user === currentUser)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            
            if (userNotifications.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-meta);">No notifications yet</div>';
                return;
            }
            
            list.innerHTML = userNotifications.map(notif => {
                const readClass = notif.read ? 'read' : 'unread';
                const date = new Date(notif.date).toLocaleString();
                return `
                    <div class="notification-item ${readClass}" onclick="markNotificationAsRead(${notif.id})">
                        <div style="font-size: 14px; margin-bottom: 5px;">${escapeHtml(notif.message)}</div>
                        <div style="font-size: 12px; color: var(--text-meta);">${date}</div>
                    </div>
                `;
            }).join('');
        }

        function markNotificationAsRead(notifId) {
            const notif = appData.notifications.find(n => n.id === notifId);
            if (notif && !notif.read) {
                notif.read = true;
                saveData();
                updateNotificationBadge();
                loadNotificationsList();
            }
        }

        function markAllAsRead() {
            appData.notifications.forEach(notif => {
                if (notif.user === currentUser) {
                    notif.read = true;
                }
            });
            saveData();
            updateNotificationBadge();
            loadNotificationsList();
        }

        function updateNotificationBadge() {
            const unreadCount = appData.notifications.filter(n => n.user === currentUser && !n.read).length;
            const badge = document.getElementById('notificationBadge');
            
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }

        function saveNotificationPrefs() {
            const comments = document.getElementById('notifComments').checked;
            const ratings = document.getElementById('notifRatings').checked;
            
            if (!appData.userSettings[currentUser]) {
                appData.userSettings[currentUser] = {};
            }
            
            appData.userSettings[currentUser].notificationPrefs = {
                comments: comments,
                ratings: ratings
            };
            
            saveData().then(saved => {
                if (saved) {
                    debugLog('🔔 Notification preferences saved');
                }
            });
        }

        function loadNotificationPrefs() {
            const prefs = appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].notificationPrefs;
            
            if (prefs) {
                document.getElementById('notifComments').checked = prefs.comments !== false;
                document.getElementById('notifRatings').checked = prefs.ratings !== false;
            }
        }

        function shouldNotify(user, type) {
            const prefs = appData.userSettings && appData.userSettings[user] && appData.userSettings[user].notificationPrefs;
            
            // Admin notifications always go through
            if (type === 'admin') return true;
            
            if (!prefs) return true; // Default: all notifications enabled
            
            if (type === 'comment') return prefs.comments !== false;
            if (type === 'rating') return prefs.ratings !== false;
            
            return true;
        }

        // ========================================
        // 3. RATING SYSTEM FUNCTIONS
        // ========================================

        function openRatingModal(postId) {
            const post = appData.games.find(g => g.id === postId);
            if (!post) return;
            
            currentRatingPostId = postId;
            selectedRating = 0;
            
            document.getElementById('ratingPostTitle').textContent = 'Rate: ' + post.title;
            document.getElementById('ratingModal').classList.remove('hidden');
            document.getElementById('submitRatingBtn').disabled = true;
            
            // Reset stars
            document.querySelectorAll('#ratingModal .star').forEach(star => {
                star.classList.remove('filled');
                star.textContent = '☆';
            });
            
            // Load existing rating if any
            if (appData.ratings[postId] && appData.ratings[postId][currentUser]) {
                const existingRating = appData.ratings[postId][currentUser];
                selectRating(existingRating);
            }
        }

        function selectRating(rating) {
            selectedRating = rating;
            document.getElementById('submitRatingBtn').disabled = false;
            
            // Update star display
            document.querySelectorAll('#ratingModal .star').forEach((star, index) => {
                if (index < rating) {
                    star.classList.add('filled');
                    star.textContent = '★';
                } else {
                    star.classList.remove('filled');
                    star.textContent = '☆';
                }
            });
            
            // Update text
            const texts = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
            document.getElementById('ratingText').textContent = texts[rating];
        }

        function submitRating() {
            if (!currentRatingPostId || selectedRating === 0) return;
            
            if (!appData.ratings[currentRatingPostId]) {
                appData.ratings[currentRatingPostId] = {};
            }
            
            const isNewRating = !appData.ratings[currentRatingPostId][currentUser];
            appData.ratings[currentRatingPostId][currentUser] = selectedRating;
            
            // Send notification to post creator
            const post = appData.games.find(g => g.id === currentRatingPostId);
            if (post && post.creator !== currentUser && shouldNotify(post.creator, 'rating')) {
                createNotification(
                    post.creator,
                    'rating',
                    `${currentUser} rated your post "${post.title}" ${selectedRating} star${selectedRating > 1 ? 's' : ''}!`,
                    currentRatingPostId
                );
            }
            
            saveData().then(saved => {
                if (saved) {
                    closeRatingModal();
                    
                    // Award XP
                    awardXP(currentUser, XP_REWARDS['rate_post'], 'Rated a post');
                    if (post && post.creator && isNewRating) {
                        awardXP(post.creator, XP_REWARDS['receive_rating'], 'Received a rating');
                    }
                    
                    // Check badges for post creator (they might have earned "first_star" or "popular")
                    if (post && post.creator) {
                        checkAndAwardBadges(post.creator);
                    }
                    
                    loadAllContent();
                    alert(`✅ ${isNewRating ? 'Rating submitted!' : 'Rating updated!'}`);
                }
            });
        }

        function closeRatingModal() {
            document.getElementById('ratingModal').classList.add('hidden');
            currentRatingPostId = null;
            selectedRating = 0;
        }

        function getAverageRating(postId) {
            if (!appData.ratings[postId]) return 0;
            
            const ratings = Object.values(appData.ratings[postId]);
            if (ratings.length === 0) return 0;
            
            const sum = ratings.reduce((a, b) => a + b, 0);
            return (sum / ratings.length).toFixed(1);
        }

        function getRatingCount(postId) {
            if (!appData.ratings[postId]) return 0;
            return Object.keys(appData.ratings[postId]).length;
        }

        function renderStarDisplay(postId) {
            const avgRating = getAverageRating(postId);
            const count = getRatingCount(postId);
            
            if (count === 0) {
                return '<span style="color: var(--text-meta); font-size: 14px;">No ratings yet</span>';
            }
            
            const fullStars = Math.floor(avgRating);
            const hasHalfStar = avgRating % 1 >= 0.5;
            
            let stars = '';
            for (let i = 0; i < 5; i++) {
                if (i < fullStars) {
                    stars += '<span style="color: #ffd700;">★</span>';
                } else if (i === fullStars && hasHalfStar) {
                    stars += '<span style="color: #ffd700;">⯨</span>';
                } else {
                    stars += '<span style="color: #ddd;">☆</span>';
                }
            }
            
            return `<div class="average-rating">${stars} <span>${avgRating} (${count})</span></div>`;
        }

        // ========================================
        // 4. TAGS SYSTEM FUNCTIONS
        // ========================================

        function togglePresetTag(tag) {
            const btn = document.querySelector(`.preset-tag-btn[data-tag="${tag}"]`);
            const isSelected = currentPostTags.includes(tag);

            if (isSelected) {
                // Deselect
                currentPostTags = currentPostTags.filter(t => t !== tag);
                if (btn) {
                    btn.style.background = '#f5f5f5';
                    btn.style.borderColor = '#ccc';
                    btn.style.color = '#333';
                }
            } else {
                if (currentPostTags.length >= 3) {
                    alert('⚠️ Maximum 3 tags per post');
                    return;
                }
                // Select
                currentPostTags.push(tag);
                if (btn) {
                    btn.style.background = 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))';
                    btn.style.borderColor = 'var(--accent-primary)';
                    btn.style.color = 'white';
                }
            }

            updateTagCountMsg();
        }

        function updateTagCountMsg() {
            const msg = document.getElementById('tagCountMsg');
            if (msg) {
                const remaining = 3 - currentPostTags.length;
                msg.textContent = remaining === 0
                    ? '✅ 3 tags selected (maximum)'
                    : `💡 ${currentPostTags.length}/3 selected — pick up to ${remaining} more`;
            }
        }

        function renderCurrentTags() {
            // Reset all preset buttons to unselected state
            document.querySelectorAll('.preset-tag-btn').forEach(btn => {
                const tag = btn.dataset.tag;
                if (currentPostTags.includes(tag)) {
                    btn.style.background = 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))';
                    btn.style.borderColor = 'var(--accent-primary)';
                    btn.style.color = 'white';
                } else {
                    btn.style.background = '#f5f5f5';
                    btn.style.borderColor = '#ccc';
                    btn.style.color = '#333';
                }
            });
            updateTagCountMsg();
        }

        function removeTagFromPost(tag) {
            currentPostTags = currentPostTags.filter(t => t !== tag);
            renderCurrentTags();
        }

        function addTagToPost() {} // Kept for backward compat, no longer used

        function renderPostTags(postId) {
            if (!appData.tags[postId] || appData.tags[postId].length === 0) {
                return '';
            }
            
            const tags = appData.tags[postId];
            
            // If 3 or fewer tags, show all
            if (tags.length <= 3) {
                return tags.map(tag => `
                    <span class="tag" onclick="filterByTag('${tag}')">${escapeHtml(tag)}</span>
                `).join('');
            }
            
            // If more than 3, show first 2 and "View tags" button
            const visibleTags = tags.slice(0, 2).map(tag => `
                <span class="tag" onclick="filterByTag('${tag}')">${escapeHtml(tag)}</span>
            `).join('');
            
            return visibleTags + `
                <span class="tag" onclick="showAllTags(${postId})" style="background: linear-gradient(135deg, #667eea, #764ba2); cursor: pointer;">
                    +${tags.length - 2} more tags
                </span>
            `;
        }

        function showAllTags(postId) {
            const tags = appData.tags[postId];
            if (!tags) return;
            
            const post = appData.games.find(g => g.id === postId);
            const postTitle = post ? post.title : 'Post';
            
            const tagsList = tags.map(tag => `
                <span class="tag" style="margin: 5px; font-size: 16px;">${escapeHtml(tag)}</span>
            `).join('');
            
            alert(`Tags for "${postTitle}":\n\n${tags.join(', ')}`);
        }

        function filterByTag(tag) {
            // This will be implemented with the browse filtering
            debugLog('🏷️ Filtering by tag: ' + tag);
            alert('Filtering by tag: ' + tag + ' (feature coming soon!)');
        }

        function getPopularTags() {
            const tagCounts = {};
            
            Object.values(appData.tags).forEach(tags => {
                tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            });
            
            return Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([tag, count]) => ({ tag, count }));
        }

        // ========================================
        // 5. RANDOM POST FUNCTION
        // ========================================

        function showRandomPost() {
            if (appData.games.length === 0) {
                alert('⚠️ No posts available!');
                return;
            }
            
            const randomIndex = Math.floor(Math.random() * appData.games.length);
            const randomPost = appData.games[randomIndex];
            
            // Track view
            if (!appData.views[randomPost.id]) {
                appData.views[randomPost.id] = 0;
            }
            appData.views[randomPost.id]++;
            
            // Track recently viewed
            if (!appData.recentlyViewed[currentUser]) {
                appData.recentlyViewed[currentUser] = [];
            }
            if (!appData.recentlyViewed[currentUser].includes(randomPost.id)) {
                appData.recentlyViewed[currentUser].unshift(randomPost.id);
                if (appData.recentlyViewed[currentUser].length > 20) {
                    appData.recentlyViewed[currentUser].pop();
                }
            }
            
            saveData();
            
            // Open first URL or show selector
            if (randomPost.urls && randomPost.urls.length > 0) {
                if (randomPost.urls.length === 1) {
                    handleOpenUrl(randomPost.urls[0].url);
                } else {
                    showWebsiteSelector(randomPost.id);
                }
            } else if (randomPost.url) {
                handleOpenUrl(randomPost.url);
            }
            
            debugLog('🎲 Random post: ' + randomPost.title);
        }

        // ========================================
        // 6. VERIFIED USERS FUNCTIONS
        // ========================================

        function openVerifyUsersPanel() {
            if (!isAdmin) {
                alert('⚠️ Admin only!');
                return;
            }
            
            loadUsersList();
            document.getElementById('verifyUsersModal').classList.remove('hidden');
        }

        function closeVerifyUsersPanel() {
            document.getElementById('verifyUsersModal').classList.add('hidden');
        }

        function loadUsersList() {
            const container = document.getElementById('usersList');
            
            if (appData.users.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: var(--text-meta);">No users yet</div>';
                return;
            }
            
            container.innerHTML = appData.users
                .filter(u => u.username !== 'admin')
                .map(user => {
                    const isVerified = appData.verifiedUsers.includes(user.username);
                    const buttonText = isVerified ? 'Unverify' : 'Verify';
                    const buttonColor = isVerified ? '#ff9800' : '#4caf50';
                    
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: var(--bg-card); border-radius: 8px; margin-bottom: 10px; border: 2px solid ${isVerified ? '#1da1f2' : 'transparent'};">
                            <div>
                                <strong>${escapeHtml(user.username)}</strong>
                                ${isVerified ? '<span class="verified-badge">✓</span>' : ''}
                                <div style="font-size: 12px; color: var(--text-meta);">Joined: ${new Date(user.dateCreated).toLocaleDateString()}</div>
                            </div>
                            <button onclick="toggleVerifyUser('${user.username}')" style="background: ${buttonColor}; color: white; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                                ${buttonText}
                            </button>
                        </div>
                    `;
                }).join('');
        }

        function toggleVerifyUser(username) {
            if (!isAdmin) {
                alert('⚠️ Admin only!');
                return;
            }
            
            const index = appData.verifiedUsers.indexOf(username);
            
            if (index > -1) {
                // Unverify
                appData.verifiedUsers.splice(index, 1);
                debugLog('❌ Unverified user: ' + username);
            } else {
                // Verify
                appData.verifiedUsers.push(username);
                debugLog('✅ Verified user: ' + username);
                
                // Send notification
                createNotification(
                    username,
                    'admin',
                    '🎉 Congratulations! You have been verified!',
                    null
                );
                
                // Award verified badge
                checkAndAwardBadges(username);
            }
            
            saveData().then(saved => {
                if (saved) {
                    loadUsersList();
                    loadAllContent(); // Refresh to show badges
                }
            });
        }

        function isVerified(username) {
            return appData.verifiedUsers.includes(username);
        }

        function renderVerifiedBadge(username) {
            if (isVerified(username)) {
                return '<span class="verified-badge">✓</span>';
            }
            return '';
        }

        // ========================================
        // END OF PHASE 1 FEATURES
        // ========================================

        // ========================================
        // PHASE 2 FEATURES - Sites v4.0
        // ========================================

        let currentProfileUser = null;

        // ========================================
        // 1. USER PROFILE FUNCTIONS
        // ========================================

        function openUserProfile(username) {
            currentProfileUser = username;
            
            // Load profile data
            const userPosts = appData.games.filter(g => g.creator === username);
            const totalRatings = userPosts.reduce((sum, post) => {
                return sum + getRatingCount(post.id);
            }, 0);
            
            // Get follower count
            const followerCount = Object.values(appData.follows).filter(followList => 
                followList.includes(username)
            ).length;
            
            // Update profile header
            document.getElementById('profileUsername').textContent = username;
            document.getElementById('profileVerifiedBadge').innerHTML = renderVerifiedBadge(username);
            
            // Update stats
            document.getElementById('profilePostCount').textContent = userPosts.length;
            document.getElementById('profileFollowers').textContent = followerCount;
            document.getElementById('profileTotalRating').textContent = totalRatings;
            
            // Get collection count
            const collectionCount = appData.collections[username] ? appData.collections[username].length : 0;
            document.getElementById('profileCollections').textContent = collectionCount;
            
            // Load bio
            const profile = appData.profiles[username] || {};
            const bio = profile.bio || 'No bio yet';
            document.getElementById('profileBioDisplay').textContent = bio;
            
            // Show/hide edit button if own profile
            if (username === currentUser) {
                document.getElementById('editBioBtn').style.display = 'block';
                document.getElementById('followBtn').style.display = 'none';
            } else {
                document.getElementById('editBioBtn').style.display = 'none';
                document.getElementById('followBtn').style.display = 'inline-block';
                updateFollowButton();
            }
            
            // Load badges (check first to ensure they're current)
            checkAndAwardBadges(username);
            loadUserBadges(username);
            
            // Load following list (only for own profile)
            if (username === currentUser) {
                loadFollowingList();
            } else {
                document.getElementById('followingSection').style.display = 'none';
            }
            
            // Load user's posts
            loadUserPosts(username);
            
            document.getElementById('userProfileModal').classList.remove('hidden');
        }

        function closeUserProfile() {
            document.getElementById('userProfileModal').classList.add('hidden');
            currentProfileUser = null;
        }

        function openMyProfile() {
            openUserProfile(currentUser);
        }

        function loadFollowingList() {
            const container = document.getElementById('profileFollowing');
            const section = document.getElementById('followingSection');
            const following = appData.follows[currentUser] || [];
            
            if (following.length === 0) {
                section.style.display = 'block';
                container.innerHTML = '<div style="color: var(--text-meta); padding: 15px; background: var(--bg-card); border-radius: 10px;">Not following anyone yet</div>';
                return;
            }
            
            section.style.display = 'block';
            container.innerHTML = following.map(username => `
                <div style="padding: 12px 20px; background: var(--bg-card); border-radius: 25px; cursor: pointer; border: 2px solid var(--accent-primary); transition: all 0.3s;" onclick="openUserProfile('${escapeHtml(username)}')">
                    <span style="font-weight: 600;">${escapeHtml(username)}</span>
                    ${renderVerifiedBadge(username)}
                </div>
            `).join('');
        }

        function editBio() {
            document.getElementById('profileBioDisplay').style.display = 'none';
            document.getElementById('profileBioEdit').style.display = 'block';
            document.getElementById('editBioBtn').style.display = 'none';
            
            const currentBio = (appData.profiles[currentUser] && appData.profiles[currentUser].bio) || '';
            document.getElementById('bioInput').value = currentBio;
        }

        function cancelBioEdit() {
            document.getElementById('profileBioDisplay').style.display = 'block';
            document.getElementById('profileBioEdit').style.display = 'none';
            document.getElementById('editBioBtn').style.display = 'block';
        }

        function saveBio() {
            const bio = document.getElementById('bioInput').value.trim();
            
            if (bio.length > 500) {
                alert('⚠️ Bio must be 500 characters or less');
                return;
            }
            
            if (!appData.profiles[currentUser]) {
                appData.profiles[currentUser] = {};
            }
            
            appData.profiles[currentUser].bio = bio;
            
            saveData().then(saved => {
                if (saved) {
                    document.getElementById('profileBioDisplay').textContent = bio || 'No bio yet';
                    cancelBioEdit();
                    alert('✅ Bio saved!');
                }
            });
        }

        function loadUserPosts(username) {
            const userPosts = appData.games.filter(g => g.creator === username);
            const container = document.getElementById('profilePosts');
            
            if (userPosts.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: var(--text-meta); padding: 40px;">No posts yet</div>';
                return;
            }
            
            container.innerHTML = userPosts.slice(0, 5).map(post => `
                <div style="padding: 15px; background: var(--bg-card); border-radius: 10px; border-left: 4px solid var(--accent-primary);">
                    <h4 style="margin: 0 0 5px 0; color: var(--text-primary);">${escapeHtml(post.title)}</h4>
                    <div style="font-size: 12px; color: var(--text-meta);">${new Date(post.dateAdded).toLocaleDateString()}</div>
                    <div style="margin-top: 10px;">
                        ${renderStarDisplay(post.id)}
                    </div>
                </div>
            `).join('');
            
            if (userPosts.length > 5) {
                container.innerHTML += `<div style="text-align: center; color: var(--text-meta); padding: 10px;">+ ${userPosts.length - 5} more posts</div>`;
            }
        }

        // ========================================
        // 2. BADGES SYSTEM
        // ========================================

        const BADGES = {
            first_post: { name: 'First Post', emoji: '🎉', description: 'Created your first post', rarity: 'common' },
            five_posts: { name: '5 Posts', emoji: '✍️', description: 'Created 5 posts', rarity: 'common' },
            ten_posts: { name: '10 Posts', emoji: '📚', description: 'Created 10 posts', rarity: 'rare' },
            first_star: { name: 'First Star', emoji: '⭐', description: 'Received your first 5-star rating', rarity: 'common' },
            popular: { name: 'Popular', emoji: '🔥', description: 'Got 10+ ratings on a post', rarity: 'rare' },
            verified: { name: 'Verified', emoji: '✅', description: 'Verified user', rarity: 'epic' },
            super_contributor: { name: 'Super Contributor', emoji: '🏆', description: '25+ posts created', rarity: 'epic' },
            legendary: { name: 'Legend', emoji: '👑', description: '50+ posts created', rarity: 'legendary' }
        };

        function checkAndAwardBadges(username) {
            if (!appData.badges[username]) {
                appData.badges[username] = [];
            }
            
            const userBadges = appData.badges[username];
            const userPosts = appData.games.filter(g => g.creator === username);
            let newBadges = [];
            
            // First Post
            if (userPosts.length >= 1 && !userBadges.includes('first_post')) {
                userBadges.push('first_post');
                newBadges.push('first_post');
            }
            
            // 5 Posts
            if (userPosts.length >= 5 && !userBadges.includes('five_posts')) {
                userBadges.push('five_posts');
                newBadges.push('five_posts');
            }
            
            // 10 Posts
            if (userPosts.length >= 10 && !userBadges.includes('ten_posts')) {
                userBadges.push('ten_posts');
                newBadges.push('ten_posts');
            }
            
            // 25 Posts (Super Contributor)
            if (userPosts.length >= 25 && !userBadges.includes('super_contributor')) {
                userBadges.push('super_contributor');
                newBadges.push('super_contributor');
            }
            
            // 50 Posts (Legendary)
            if (userPosts.length >= 50 && !userBadges.includes('legendary')) {
                userBadges.push('legendary');
                newBadges.push('legendary');
            }
            
            // First 5-star rating
            const hasFiveStar = userPosts.some(post => {
                if (!appData.ratings[post.id]) return false;
                return Object.values(appData.ratings[post.id]).includes(5);
            });
            if (hasFiveStar && !userBadges.includes('first_star')) {
                userBadges.push('first_star');
                newBadges.push('first_star');
            }
            
            // Popular (10+ ratings on a post)
            const hasPopularPost = userPosts.some(post => getRatingCount(post.id) >= 10);
            if (hasPopularPost && !userBadges.includes('popular')) {
                userBadges.push('popular');
                newBadges.push('popular');
            }
            
            // Verified badge
            if (isVerified(username) && !userBadges.includes('verified')) {
                userBadges.push('verified');
                newBadges.push('verified');
            }
            
            // Notify user of new badges
            if (newBadges.length > 0) {
                newBadges.forEach(badgeId => {
                    const badge = BADGES[badgeId];
                    createNotification(
                        username,
                        'admin',
                        `🏆 New Badge Earned: ${badge.emoji} ${badge.name} - ${badge.description}`,
                        null
                    );
                });
                saveData();
            }
        }

        function loadUserBadges(username) {
            const container = document.getElementById('profileBadges');
            const userBadges = appData.badges[username] || [];
            
            if (userBadges.length === 0) {
                container.innerHTML = '<div style="color: var(--text-meta);">No badges yet</div>';
                return;
            }
            
            container.innerHTML = userBadges.map(badgeId => {
                const badge = BADGES[badgeId];
                if (!badge) return '';
                
                return `
                    <div class="badge ${badge.rarity}" title="${badge.description}">
                        <span style="font-size: 20px;">${badge.emoji}</span>
                        <span>${badge.name}</span>
                    </div>
                `;
            }).join('');
        }

        // ========================================
        // 3. FOLLOW SYSTEM
        // ========================================

        function toggleFollow() {
            if (!currentProfileUser || currentProfileUser === currentUser) return;
            
            if (!appData.follows[currentUser]) {
                appData.follows[currentUser] = [];
            }
            
            const following = appData.follows[currentUser];
            const isFollowing = following.includes(currentProfileUser);
            
            if (isFollowing) {
                // Unfollow
                appData.follows[currentUser] = following.filter(u => u !== currentProfileUser);
                debugLog('👋 Unfollowed: ' + currentProfileUser);
            } else {
                // Follow
                appData.follows[currentUser].push(currentProfileUser);
                debugLog('👥 Following: ' + currentProfileUser);
                
                // Notify user
                createNotification(
                    currentProfileUser,
                    'admin',
                    `👥 ${currentUser} started following you!`,
                    null
                );
            }
            
            saveData().then(saved => {
                if (saved) {
                    updateFollowButton();
                    // Update follower count
                    const followerCount = Object.values(appData.follows).filter(followList => 
                        followList.includes(currentProfileUser)
                    ).length;
                    document.getElementById('profileFollowers').textContent = followerCount;
                }
            });
        }

        function updateFollowButton() {
            const btn = document.getElementById('followBtn');
            if (!currentProfileUser || currentProfileUser === currentUser) {
                btn.style.display = 'none';
                return;
            }
            
            const isFollowing = appData.follows[currentUser] && appData.follows[currentUser].includes(currentProfileUser);
            
            if (isFollowing) {
                btn.textContent = '✓ Following';
                btn.style.background = '#4caf50';
            } else {
                btn.textContent = '+ Follow';
                btn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
            }
        }

        function isFollowing(username) {
            return appData.follows[currentUser] && appData.follows[currentUser].includes(username);
        }

        // ========================================
        // 4. TRENDING SYSTEM
        // ========================================

        function loadTrending() {
            const gallery = document.getElementById('browseGallery');
            if (!gallery) {
                debugLog('❌ browseGallery element not found!');
                return;
            }
            
            gallery.innerHTML = '<div style="text-align: center; padding: 40px;"><h2>🔥 Trending Posts</h2><p style="color: var(--text-meta);">Posts that are hot right now!</p></div>';
            
            if (appData.games.length === 0) {
                gallery.innerHTML += '<div style="text-align: center; padding: 40px; color: var(--text-meta);">No posts yet. Be the first to create content!</div>';
                return;
            }
            
            // Calculate trending score for each post
            const now = Date.now();
            const DAY_MS = 24 * 60 * 60 * 1000;
            
            const scoredGames = appData.games.map(game => {
                const age = (now - new Date(game.dateAdded).getTime()) / DAY_MS;
                const ratingCount = getRatingCount(game.id);
                const avgRating = parseFloat(getAverageRating(game.id)) || 0;
                const commentCount = appData.comments ? appData.comments.filter(c => c.postId === game.id).length : 0;
                const viewCount = appData.views[game.id] || 0;
                
                // Trending score formula
                const score = ((ratingCount * avgRating * 2) + (commentCount * 1.5) + (viewCount * 0.1)) / (age + 2);
                
                return { game, score };
            });
            
            // Sort by score
            scoredGames.sort((a, b) => b.score - a.score);
            
            // Take top 20
            const trendingGames = scoredGames.slice(0, 20);
            
            if (trendingGames.length === 0) {
                gallery.innerHTML += '<div style="text-align: center; padding: 40px; color: var(--text-meta);">No trending posts yet. Be the first to create content!</div>';
                return;
            }
            
            gallery.innerHTML += '<div class="games-grid">' + trendingGames.map(({ game }, index) => {
                // Add trending rank badge
                let rankBadge = '';
                if (index < 3) {
                    const medals = ['🥇', '🥈', '🥉'];
                    rankBadge = `<div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 5px 10px; border-radius: 15px; font-weight: bold; z-index: 1;">${medals[index]} #${index + 1}</div>`;
                }
                
                return `<div style="position: relative;">${rankBadge}${createGameCard(game)}</div>`;
            }).join('') + '</div>';
        }

        // ========================================
        // ========================================
        // PHASE 3 FEATURES - Sites v4.0
        // ========================================

        let currentCollectionPostId = null;

        // ========================================
        // 1. THUMBNAIL FUNCTIONS
        // ========================================

        // Add thumbnail preview on input
        document.addEventListener('DOMContentLoaded', function() {
            const thumbnailInput = document.getElementById('thumbnailUrl');
            if (thumbnailInput) {
                thumbnailInput.addEventListener('input', function() {
                    const url = this.value.trim();
                    const preview = document.getElementById('thumbnailPreview');
                    const img = document.getElementById('thumbnailPreviewImg');
                    
                    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                        img.src = url;
                        img.onerror = function() {
                            preview.style.display = 'none';
                        };
                        img.onload = function() {
                            preview.style.display = 'block';
                        };
                    } else {
                        preview.style.display = 'none';
                    }
                });
            }
        });

        function renderThumbnail(post) {
            if (!post.thumbnail) return '';
            
            return `
                <img src="${escapeHtml(post.thumbnail)}" 
                     class="post-thumbnail" 
                     alt="Thumbnail" 
                     onclick="window.open('${escapeHtml(post.thumbnail)}', '_blank')"
                     onerror="this.style.display='none'">
            `;
        }

        // ========================================
        // 2. REACTIONS FUNCTIONS
        // ========================================

        function renderReactions(postId) {
            const reactions = appData.reactions[postId] || {};
            const userReaction = reactions[currentUser];
            
            const reactionTypes = {
                '👍': { name: 'Like', emoji: '👍' },
                '❤️': { name: 'Love', emoji: '❤️' },
                '😂': { name: 'Laugh', emoji: '😂' },
                '🎉': { name: 'Celebrate', emoji: '🎉' }
            };
            
            // Count reactions
            const counts = {};
            Object.values(reactions).forEach(emoji => {
                counts[emoji] = (counts[emoji] || 0) + 1;
            });
            
            return `
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0;">
                    ${Object.entries(reactionTypes).map(([emoji, data]) => {
                        const count = counts[emoji] || 0;
                        const isActive = userReaction === emoji;
                        return `
                            <button class="reaction-btn ${isActive ? 'active' : ''}" 
                                    onclick="toggleReaction(${postId}, '${emoji}')" 
                                    title="${data.name}">
                                ${emoji} ${count > 0 ? count : ''}
                            </button>
                        `;
                    }).join('')}
                </div>
            `;
        }

        function toggleReaction(postId, emoji) {
            if (!appData.reactions[postId]) {
                appData.reactions[postId] = {};
            }
            
            const currentReaction = appData.reactions[postId][currentUser];
            
            if (currentReaction === emoji) {
                // Remove reaction
                delete appData.reactions[postId][currentUser];
            } else {
                // Add/change reaction
                appData.reactions[postId][currentUser] = emoji;
                
                // Notify post creator
                const post = appData.games.find(g => g.id === postId);
                if (post && post.creator !== currentUser) {
                    createNotification(
                        post.creator,
                        'admin',
                        `${currentUser} reacted ${emoji} to your post "${post.title}"`,
                        postId
                    );
                }
            }
            
            saveData().then(saved => {
                if (saved) {
                    loadAllContent();
                }
            });
        }

        // ========================================
        // 3. COLLECTIONS FUNCTIONS
        // ========================================

        function loadCollections() {
            const gallery = document.getElementById('collectionsGallery');
            const userCollections = appData.collections[currentUser] || [];
            
            if (userCollections.length === 0) {
                gallery.innerHTML = `
                    <div style="max-width:600px;margin:60px auto;background:var(--bg-card);border-radius:15px;padding:60px 40px;box-shadow:0 5px 15px var(--shadow);text-align:center;">
                        <h2 style="font-size: 48px; margin-bottom: 10px;">📂</h2>
                        <h3 style="color: var(--text-primary); margin-bottom: 10px;">No Collections Yet</h3>
                        <p style="color: var(--text-meta); margin-bottom: 20px;">Create collections to organize your favorite posts!</p>
                        <button onclick="openCollectionsModal()" style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color: white; padding: 12px 30px; border: none; border-radius: 25px; cursor: pointer; font-weight: 600; font-size: 16px;">
                            + Create Your First Collection
                        </button>
                    </div>
                `;
                return;
            }
            
            gallery.innerHTML = `
                <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <h2>🔖 My Collections</h2>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="exportCollections()" style="background: #4caf50; color: white; padding: 10px 20px; border: none; border-radius: 20px; cursor: pointer; font-weight: 600;">
                            📥 Export
                        </button>
                        <button onclick="openCollectionsModal()" style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color: white; padding: 10px 20px; border: none; border-radius: 20px; cursor: pointer; font-weight: 600;">
                            + New Collection
                        </button>
                    </div>
                </div>
                ${userCollections.map(collection => {
                    const posts = collection.posts.map(postId => appData.games.find(g => g.id === postId)).filter(Boolean);
                    return `
                        <div class="collection-item" onclick="viewCollection('${escapeHtml(collection.name)}')" style="margin-bottom: 15px;">
                            <h3 style="margin: 0 0 10px 0; color: var(--text-primary);">📁 ${escapeHtml(collection.name)}</h3>
                            <div style="color: var(--text-meta); font-size: 14px;">
                                ${posts.length} post${posts.length !== 1 ? 's' : ''}
                            </div>
                            <button onclick="event.stopPropagation(); deleteCollection('${escapeHtml(collection.name)}')" 
                                    style="margin-top: 10px; background: #f44336; color: white; padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                Delete Collection
                            </button>
                        </div>
                    `;
                }).join('')}
            `;
        }

        function openCollectionsModal() {
            loadCollectionsList();
            document.getElementById('collectionsModal').classList.remove('hidden');
        }

        function closeCollectionsModal() {
            document.getElementById('collectionsModal').classList.add('hidden');
        }

        function loadCollectionsList() {
            const container = document.getElementById('collectionsList');
            const userCollections = appData.collections[currentUser] || [];
            
            if (userCollections.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-meta);">No collections yet. Create one above!</div>';
                return;
            }
            
            container.innerHTML = userCollections.map(collection => {
                const posts = collection.posts.map(postId => appData.games.find(g => g.id === postId)).filter(Boolean);
                return `
                    <div class="collection-item" style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <h3 style="margin: 0 0 5px 0; color: var(--text-primary);">📁 ${escapeHtml(collection.name)}</h3>
                                <div style="color: var(--text-meta); font-size: 14px; margin-bottom: 10px;">
                                    ${posts.length} post${posts.length !== 1 ? 's' : ''}
                                </div>
                                ${posts.slice(0, 3).map(post => `
                                    <div style="font-size: 12px; color: var(--text-secondary); margin: 3px 0;">• ${escapeHtml(post.title)}</div>
                                `).join('')}
                                ${posts.length > 3 ? `<div style="font-size: 12px; color: var(--text-meta); margin-top: 5px;">+ ${posts.length - 3} more</div>` : ''}
                            </div>
                            <button onclick="deleteCollection('${escapeHtml(collection.name)}')" 
                                    style="background: #f44336; color: white; padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                Delete
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function createCollection() {
            const name = document.getElementById('newCollectionName').value.trim();
            
            if (!name) {
                alert('⚠️ Please enter a collection name');
                return;
            }
            
            if (name.length > 50) {
                alert('⚠️ Collection name must be 50 characters or less');
                return;
            }
            
            if (!appData.collections[currentUser]) {
                appData.collections[currentUser] = [];
            }
            
            // Check if collection already exists
            if (appData.collections[currentUser].some(c => c.name === name)) {
                alert('⚠️ A collection with this name already exists');
                return;
            }
            
            appData.collections[currentUser].push({
                name: name,
                posts: [],
                dateCreated: new Date().toISOString()
            });
            
            saveData().then(saved => {
                if (saved) {
                    document.getElementById('newCollectionName').value = '';
                    loadCollectionsList();
                    loadCollections(); // Refresh collections tab if open
                    alert('✅ Collection created!');
                }
            });
        }

        function deleteCollection(name) {
            if (!confirm(`Delete collection "${name}"?`)) return;
            
            if (!appData.collections[currentUser]) return;
            
            appData.collections[currentUser] = appData.collections[currentUser].filter(c => c.name !== name);
            
            saveData().then(saved => {
                if (saved) {
                    loadCollectionsList();
                    loadCollections();
                    alert('✅ Collection deleted');
                }
            });
        }

        function viewCollection(name) {
            const collection = appData.collections[currentUser].find(c => c.name === name);
            if (!collection) return;
            
            const posts = collection.posts.map(postId => appData.games.find(g => g.id === postId)).filter(Boolean);
            
            const gallery = document.getElementById('collectionsGallery');
            gallery.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <button onclick="loadCollections()" style="background: #999; color: white; padding: 8px 16px; border: none; border-radius: 20px; cursor: pointer; margin-bottom: 15px;">
                        ← Back to Collections
                    </button>
                    <h2>📁 ${escapeHtml(name)}</h2>
                    <p style="color: var(--text-meta);">${posts.length} post${posts.length !== 1 ? 's' : ''}</p>
                </div>
                ${posts.length === 0 ? 
                    '<div style="text-align: center; padding: 40px; color: var(--text-meta);">This collection is empty</div>' :
                    '<div class="games-grid">' + posts.map(post => createGameCard(post)).join('') + '</div>'
                }
            `;
        }

        function openAddToCollection(postId) {
            currentCollectionPostId = postId;
            const post = appData.games.find(g => g.id === postId);
            
            if (!post) return;
            
            // Create collections if needed
            if (!appData.collections[currentUser]) {
                appData.collections[currentUser] = [];
            }
            
            if (appData.collections[currentUser].length === 0) {
                alert('⚠️ You need to create a collection first! Go to the Collections tab to create one.');
                return;
            }
            
            document.getElementById('addToCollectionPostTitle').textContent = `Add "${post.title}" to:`;
            
            const container = document.getElementById('collectionCheckboxes');
            container.innerHTML = appData.collections[currentUser].map(collection => {
                const isInCollection = collection.posts.includes(postId);
                return `
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(102, 126, 234, 0.05); border-radius: 8px; margin-bottom: 8px; cursor: pointer;">
                        <input type="checkbox" 
                               class="collection-checkbox" 
                               data-collection="${escapeHtml(collection.name)}" 
                               ${isInCollection ? 'checked' : ''}
                               style="width: 20px; height: 20px; cursor: pointer;">
                        <span style="font-weight: 600;">📁 ${escapeHtml(collection.name)}</span>
                    </label>
                `;
            }).join('');
            
            document.getElementById('addToCollectionModal').classList.remove('hidden');
        }

        function closeAddToCollectionModal() {
            document.getElementById('addToCollectionModal').classList.add('hidden');
            currentCollectionPostId = null;
        }

        function saveToCollections() {
            if (!currentCollectionPostId) return;
            
            const checkboxes = document.querySelectorAll('.collection-checkbox');
            
            checkboxes.forEach(checkbox => {
                const collectionName = checkbox.dataset.collection;
                const collection = appData.collections[currentUser].find(c => c.name === collectionName);
                
                if (!collection) return;
                
                const isChecked = checkbox.checked;
                const isInCollection = collection.posts.includes(currentCollectionPostId);
                
                if (isChecked && !isInCollection) {
                    // Add to collection
                    collection.posts.push(currentCollectionPostId);
                } else if (!isChecked && isInCollection) {
                    // Remove from collection
                    collection.posts = collection.posts.filter(id => id !== currentCollectionPostId);
                }
            });
            
            saveData().then(saved => {
                if (saved) {
                    closeAddToCollectionModal();
                    alert('✅ Collections updated!');
                }
            });
        }

        // ========================================
        // END OF PHASE 3 FEATURES
        // ========================================

        // ========================================
        // PHASE 4 FEATURES - Sites v4.0
        // ========================================

        let currentReportTarget = null;
        let currentAnalyticsPost = null;

        // 1. THUMBNAILS TOGGLE
        function toggleThumbnails() {
            const showThumbs = document.getElementById('showThumbnails').checked;
            document.documentElement.setAttribute('data-show-thumbnails', showThumbs ? 'true' : 'false');
            if (!appData.userSettings[currentUser]) appData.userSettings[currentUser] = {};
            appData.userSettings[currentUser].showThumbnails = showThumbs;
            saveData().then(saved => { if (saved) loadAllContent(); });
        }

        function loadThumbnailsPreference() {
            const showThumbs = !(appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].showThumbnails === false);
            document.documentElement.setAttribute('data-show-thumbnails', showThumbs ? 'true' : 'false');
            if (document.getElementById('showThumbnails')) {
                document.getElementById('showThumbnails').checked = showThumbs;
            }
        }

        // 2. THEME PRESETS
        function applyThemePreset() {
            const theme = document.getElementById('themePreset').value;
            document.documentElement.setAttribute('data-theme', theme);
            if (!appData.userSettings[currentUser]) appData.userSettings[currentUser] = {};
            appData.userSettings[currentUser].theme = theme;
            saveData();
        }

        function loadThemePreset() {
            const theme = (appData.userSettings && appData.userSettings[currentUser] && appData.userSettings[currentUser].theme) || 'default';
            document.documentElement.setAttribute('data-theme', theme);
            if (document.getElementById('themePreset')) {
                document.getElementById('themePreset').value = theme;
            }
        }

        // 3. ANALYTICS
        function openAnalyticsModal(postId) {
            const post = appData.games.find(g => g.id === postId);
            if (!post) return;

            const viewCount = appData.views[postId] || 0;
            const ratingCount = getRatingCount(postId);
            const avgRating = parseFloat(getAverageRating(postId)) || 0;
            const commentCount = (appData.comments || []).filter(c => c.postId === postId).length;
            const reactions = appData.reactions[postId] || {};
            const reactionCounts = {};
            Object.values(reactions).forEach(e => { reactionCounts[e] = (reactionCounts[e] || 0) + 1; });
            let collectionCount = 0;
            Object.values(appData.collections || {}).forEach(cols => cols.forEach(col => { if (col.posts.includes(postId)) collectionCount++; }));

            document.getElementById('analyticsContent').innerHTML = `
                <div style="margin-bottom:20px;">
                    <h3 style="color:var(--text-primary)">${escapeHtml(post.title)}</h3>
                    <p style="color:var(--text-meta)">By ${escapeHtml(post.creator)} • ${new Date(post.dateAdded).toLocaleDateString()}</p>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-bottom:20px;">
                    ${[['👁️ Views', viewCount], ['⭐ Ratings', ratingCount], ['⭐ Avg Rating', avgRating], ['💬 Comments', commentCount], ['👍 Reactions', Object.keys(reactions).length], ['🔖 In Collections', collectionCount]].map(([label, val]) => `
                        <div style="background:rgba(102,126,234,0.1);padding:20px;border-radius:10px;text-align:center;">
                            <div style="font-size:32px;font-weight:bold;color:var(--accent-primary)">${val}</div>
                            <div style="color:var(--text-meta);font-size:13px;margin-top:5px;">${label}</div>
                        </div>`).join('')}
                </div>
                ${Object.keys(reactionCounts).length > 0 ? `
                    <h4 style="color:var(--text-primary);margin-bottom:10px;">Reaction Breakdown:</h4>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        ${Object.entries(reactionCounts).map(([e, c]) => `<div style="padding:10px 15px;background:var(--bg-card);border-radius:10px;border:2px solid var(--accent-primary);"><span style="font-size:22px">${e}</span> <strong>${c}</strong></div>`).join('')}
                    </div>` : ''}
            `;
            document.getElementById('analyticsModal').classList.remove('hidden');
        }

        function closeAnalyticsModal() {
            document.getElementById('analyticsModal').classList.add('hidden');
        }

        // 4. ADVANCED FILTERS
        function openFiltersModal() {
            const allTags = new Set();
            Object.values(appData.tags || {}).forEach(tags => tags.forEach(t => allTags.add(t)));
            document.getElementById('filterByTag').innerHTML = '<option value="">All Tags</option>' +
                Array.from(allTags).sort().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

            const allCreators = new Set(appData.games.map(g => g.creator));
            document.getElementById('filterByCreator').innerHTML = '<option value="">All Creators</option>' +
                Array.from(allCreators).sort().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

            document.getElementById('filterByTag').value = activeFilters.tag;
            document.getElementById('filterByRating').value = activeFilters.rating;
            document.getElementById('filterByDate').value = activeFilters.date;
            document.getElementById('filterByCreator').value = activeFilters.creator;
            document.getElementById('filtersModal').classList.remove('hidden');
        }

        function closeFiltersModal() {
            document.getElementById('filtersModal').classList.add('hidden');
        }

        function applyAdvancedFilters() {
            activeFilters = {
                tag: document.getElementById('filterByTag').value,
                rating: parseInt(document.getElementById('filterByRating').value) || 0,
                date: document.getElementById('filterByDate').value,
                creator: document.getElementById('filterByCreator').value
            };
            closeFiltersModal();
            loadBrowse();
        }

        function clearFilters() {
            activeFilters = { tag: '', rating: 0, date: 'all', creator: '' };
            closeFiltersModal();
            loadBrowse();
        }

        function applyFiltersToGames(games) {
            let filtered = [...games];
            if (activeFilters.tag) {
                filtered = filtered.filter(g => (appData.tags[g.id] || []).includes(activeFilters.tag));
            }
            if (activeFilters.rating > 0) {
                filtered = filtered.filter(g => (parseFloat(getAverageRating(g.id)) || 0) >= activeFilters.rating);
            }
            if (activeFilters.date !== 'all') {
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const cutoffs = { today: 0, week: 7, month: 30, year: 365 };
                const days = cutoffs[activeFilters.date];
                const cutoff = new Date(today);
                cutoff.setDate(cutoff.getDate() - days);
                filtered = filtered.filter(g => new Date(g.dateAdded) >= cutoff);
            }
            if (activeFilters.creator) {
                filtered = filtered.filter(g => g.creator === activeFilters.creator);
            }
            return filtered;
        }

        // 5. REPORT SYSTEM
        function openReportModal(postId) {
            currentReportTarget = { postId };
            const post = appData.games.find(g => g.id === postId);
            document.getElementById('reportTargetTitle').textContent = `Report post: "${post ? post.title : ''}"`;
            document.getElementById('reportReason').value = 'spam';
            document.getElementById('reportDetails').value = '';
            document.getElementById('reportModal').classList.remove('hidden');
        }

        function closeReportModal() {
            document.getElementById('reportModal').classList.add('hidden');
            currentReportTarget = null;
        }

        function submitReport() {
            if (!currentReportTarget) return;
            
            const reason = document.getElementById('reportReason').value;
            const details = document.getElementById('reportDetails').value.trim();
            const post = appData.games.find(g => g.id === currentReportTarget.postId);
            const postTitle = post ? post.title : 'Unknown';
            const reasonLabels = { spam: '🚫 Spam', inappropriate: '⚠️ Inappropriate', misleading: '❌ Misleading', harassment: '😠 Harassment', other: '🔹 Other' };
            
            appData.reports.push({
                id: Date.now(),
                reporter: currentUser,
                postId: currentReportTarget.postId,
                reason,
                details,
                date: new Date().toISOString()
            });
            
            // Notify admin
            createNotification(
                'admin',
                'admin',
                `🚨 Report from ${currentUser}: "${postTitle}" — Reason: ${reasonLabels[reason] || reason}${details ? ' — "' + details + '"' : ''}`,
                currentReportTarget.postId
            );
            
            saveData().then(saved => {
                if (saved) { closeReportModal(); alert('✅ Report submitted. Admins will review it.'); }
            });
        }

        // 6. GAMIFICATION (XP & LEVELS)
        const XP_PER_LEVEL = 100;

        function awardXP(username, amount, reason) {
            if (!appData.xp) appData.xp = {};
            if (!appData.levels) appData.levels = {};
            if (!appData.xp[username]) appData.xp[username] = 0;
            if (!appData.levels[username]) appData.levels[username] = 1;

            const oldLevel = appData.levels[username];
            appData.xp[username] += amount;
            const newLevel = Math.floor(appData.xp[username] / XP_PER_LEVEL) + 1;
            appData.levels[username] = newLevel;

            if (newLevel > oldLevel) {
                createNotification(username, 'admin', `🎉 Level Up! You're now Level ${newLevel}!`, null);
            }
            debugLog(`🎮 ${username} +${amount} XP (${reason})`);
        }

        function getUserLevel(username) {
            return (appData.levels && appData.levels[username]) || 1;
        }

        function renderLevelBadge(username) {
            const level = getUserLevel(username);
            if (level <= 1) return '';
            let color = '#4caf50';
            if (level >= 10) color = '#2196f3';
            if (level >= 20) color = '#9c27b0';
            if (level >= 30) color = '#ff9800';
            if (level >= 50) color = '#f44336';
            return `<span style="display:inline-block;background:${color};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;margin-left:5px;">Lv${level}</span>`;
        }

        // 7. EXPORT COLLECTIONS
        function exportCollections() {
            const cols = appData.collections[currentUser] || [];
            if (cols.length === 0) { alert('⚠️ No collections to export'); return; }
            const data = cols.map(col => ({
                name: col.name,
                posts: col.posts.map(id => {
                    const p = appData.games.find(g => g.id === id);
                    return p ? { title: p.title, description: p.description, urls: p.urls, creator: p.creator } : null;
                }).filter(Boolean)
            }));
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `collections_${Date.now()}.json`; a.click();
            URL.revokeObjectURL(url);
        }

        // ========================================
        // END OF PHASE 4 FEATURES

        // ========================================
        // ADMIN REPORTS SYSTEM
        // ========================================

        let currentReviewReportId = null;

        function loadAdminReports() {
            if (!isAdmin) return;

            const list = document.getElementById('adminReportsList');
            const noMsg = document.getElementById('noReportsMsg');
            const badge = document.getElementById('reportsBadge');

            const pending = (appData.reports || []).filter(r => !r.reviewed);

            badge.textContent = pending.length > 0 ? pending.length : '';
            badge.style.display = pending.length > 0 ? 'inline' : 'none';

            if (pending.length === 0) {
                list.style.display = 'none';
                noMsg.style.display = 'block';
                return;
            }

            list.style.display = 'flex';
            noMsg.style.display = 'none';

            const reasonLabels = {
                spam: '🚫 Spam',
                inappropriate: '⚠️ Inappropriate',
                misleading: '❌ Misleading',
                harassment: '😠 Harassment',
                other: '🔹 Other'
            };

            list.innerHTML = pending.map(report => {
                const post = appData.games.find(g => g.id === report.postId);
                const postTitle = post ? post.title : '(deleted post)';
                const date = new Date(report.date).toLocaleDateString();
                return `
                    <div style="background: rgba(244,67,54,0.08); border: 2px solid rgba(244,67,54,0.3); border-radius: 10px; padding: 12px 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: start; gap: 10px; flex-wrap: wrap;">
                            <div style="flex: 1;">
                                <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                                    ${reasonLabels[report.reason] || report.reason}
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">
                                    Post: <strong>${escapeHtml(postTitle)}</strong>
                                </div>
                                <div style="font-size: 12px; color: var(--text-meta);">
                                    Reported by <strong>${escapeHtml(report.reporter)}</strong> · ${date}
                                </div>
                                ${report.details ? `<div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px; padding: 6px 10px; background: rgba(0,0,0,0.05); border-radius: 6px;">"${escapeHtml(report.details)}"</div>` : ''}
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 6px; min-width: 110px;">
                                ${post ? `<button onclick="reviewGoToPost(${report.id})" style="background: #1976d2; color: white; border: none; padding: 7px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;">🔍 Review Post</button>` : ''}
                                <button onclick="dismissReport(${report.id})" style="background: #4caf50; color: white; border: none; padding: 7px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;">✅ Mark Safe</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function reviewGoToPost(reportId) {
            const report = appData.reports.find(r => r.id === reportId);
            if (!report) return;

            const post = appData.games.find(g => g.id === report.postId);
            if (!post) { alert('⚠️ Post has already been deleted.'); return; }

            const reasonLabels = { spam: '🚫 Spam', inappropriate: '⚠️ Inappropriate', misleading: '❌ Misleading', harassment: '😠 Harassment', other: '🔹 Other' };

            currentReviewReportId = reportId;

            // Close settings and go to browse tab
            closeSettingsModal();
            switchTab('browse');

            // Show the review banner
            document.getElementById('bannerReportInfo').textContent =
                `"${post.title}" — Reason: ${reasonLabels[report.reason] || report.reason} — by ${report.reporter}`;
            document.getElementById('reportReviewBanner').style.display = 'block';

            // Scroll/highlight the post card
            setTimeout(() => {
                const card = document.querySelector(`[data-post-id="${report.postId}"]`);
                if (card) {
                    card.style.outline = '4px solid #f44336';
                    card.style.borderRadius = '12px';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);
        }

        function reviewReportSafe() {
            if (!currentReviewReportId) return;
            dismissReport(currentReviewReportId);
            dismissReviewBanner();
            alert('✅ Post marked as safe. Report dismissed.');
        }

        function reviewReportDelete() {
            if (!currentReviewReportId) return;
            const report = appData.reports.find(r => r.id === currentReviewReportId);
            if (!report) return;

            if (!confirm('🗑️ Delete this post permanently?')) return;

            // Delete the post
            appData.games = appData.games.filter(g => g.id !== report.postId);
            dismissReport(currentReviewReportId);
            dismissReviewBanner();

            saveData().then(saved => {
                if (saved) {
                    loadAllContent();
                    alert('🗑️ Post deleted and report resolved.');
                }
            });
        }

        function dismissReport(reportId) {
            const report = appData.reports.find(r => r.id === reportId);
            if (report) report.reviewed = true;
            saveData().then(() => loadAdminReports());
        }

        function dismissReviewBanner() {
            currentReviewReportId = null;
            document.getElementById('reportReviewBanner').style.display = 'none';
            // Remove highlight from any card
            document.querySelectorAll('[data-post-id]').forEach(card => {
                card.style.outline = '';
            });
        }

        // ========================================
        // END OF ADMIN REPORTS SYSTEM
        // ========================================

        // ========================================
        // PHASE 5 FEATURES - Sites v4.0
        // ========================================

        // 1. PIN POSTS
        function togglePinPost(postId) {
            if (!appData.pinnedPosts) appData.pinnedPosts = [];
            const post = appData.games.find(g => g.id === postId);
            if (!post) return;

            const canPin = isAdmin || post.creator === currentUser;
            if (!canPin) {
                alert('⚠️ Only admins and post creators can pin posts');
                return;
            }

            const isPinned = appData.pinnedPosts.includes(postId);
            if (isPinned) {
                appData.pinnedPosts = appData.pinnedPosts.filter(id => id !== postId);
            } else {
                appData.pinnedPosts.push(postId);
            }

            saveData().then(saved => {
                if (saved) {
                    loadAllContent();
                    alert(isPinned ? '📌 Post unpinned' : '📌 Post pinned to top!');
                }
            });
        }

        // 2. BOOKMARKS
        function toggleBookmark(postId) {
            if (!appData.bookmarks) appData.bookmarks = {};
            if (!appData.bookmarks[currentUser]) appData.bookmarks[currentUser] = [];

            const bookmarked = appData.bookmarks[currentUser].includes(postId);
            if (bookmarked) {
                appData.bookmarks[currentUser] = appData.bookmarks[currentUser].filter(id => id !== postId);
            } else {
                appData.bookmarks[currentUser].push(postId);
            }

            saveData().then(saved => {
                if (saved) {
                    loadAllContent();
                }
            });
        }

        function loadBookmarks() {
            const gallery = document.getElementById('bookmarksGallery');
            const bookmarkedIds = (appData.bookmarks && appData.bookmarks[currentUser]) || [];
            const bookmarkedPosts = appData.games.filter(g => bookmarkedIds.includes(g.id));

            if (bookmarkedPosts.length === 0) {
                gallery.innerHTML = `
                    <div style="max-width:600px;margin:60px auto;background:var(--bg-card);border-radius:15px;padding:60px 40px;box-shadow:0 5px 15px var(--shadow);text-align:center;">
                        <h2 style="font-size:48px;margin-bottom:10px;">🔖</h2>
                        <h3 style="color:var(--text-primary);margin-bottom:10px;">No Bookmarks Yet</h3>
                        <p style="color:var(--text-meta);">Bookmark posts to save them for later!</p>
                    </div>
                `;
                return;
            }

            const cardsHTML = bookmarkedPosts.map(createGameCard).join('');
            gallery.innerHTML = `
                <div style="margin-bottom:20px;">
                    <h2>🔖 My Bookmarks</h2>
                </div>
                <div class="games-grid">${cardsHTML}</div>
            `;
        }

        // 3. LEADERBOARDS
        function loadLeaderboards() {
            const container = document.getElementById('leaderboardsContent');
            
            // Top by XP
            const byXP = Object.entries(appData.xp || {})
                .map(([user, xp]) => ({ user, xp, level: appData.levels[user] || 1 }))
                .sort((a, b) => b.xp - a.xp)
                .slice(0, 10);

            // Top by Posts
            const postCounts = {};
            appData.games.forEach(g => {
                postCounts[g.creator] = (postCounts[g.creator] || 0) + 1;
            });
            const byPosts = Object.entries(postCounts)
                .map(([user, count]) => ({ user, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            // Top Rated (avg rating)
            const userRatings = {};
            appData.games.forEach(g => {
                const avg = parseFloat(getAverageRating(g.id)) || 0;
                const count = getRatingCount(g.id);
                if (count >= 3) { // Only if they have 3+ ratings
                    if (!userRatings[g.creator]) userRatings[g.creator] = [];
                    userRatings[g.creator].push(avg);
                }
            });
            const byRating = Object.entries(userRatings)
                .map(([user, ratings]) => ({
                    user,
                    avgRating: (ratings.reduce((a,b) => a+b, 0) / ratings.length).toFixed(2)
                }))
                .sort((a, b) => b.avgRating - a.avgRating)
                .slice(0, 10);

            container.innerHTML = `
                <h2 style="margin-bottom:20px;">🏆 Leaderboards</h2>
                
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:30px;">
                    <!-- XP Leaderboard -->
                    <div style="background:var(--bg-card);border-radius:12px;padding:20px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                        <h3 style="color:var(--accent-primary);margin-bottom:15px;">🎮 Top by XP</h3>
                        ${byXP.length > 0 ? byXP.map((item, idx) => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:${idx === 0 ? 'rgba(255,215,0,0.1)' : 'rgba(0,0,0,0.02)'};border-radius:8px;margin-bottom:8px;">
                                <div>
                                    <span style="font-weight:bold;margin-right:8px;">#${idx + 1}</span>
                                    <span onclick="openUserProfile('${item.user}')" style="cursor:pointer;color:var(--accent-primary);text-decoration:underline;">${escapeHtml(item.user)}</span>
                                    ${renderVerifiedBadge(item.user)}
                                    ${renderLevelBadge(item.user)}
                                </div>
                                <div style="font-weight:bold;color:var(--accent-primary);">${item.xp} XP</div>
                            </div>
                        `).join('') : '<p style="color:var(--text-meta);text-align:center;">No data yet</p>'}
                    </div>

                    <!-- Posts Leaderboard -->
                    <div style="background:var(--bg-card);border-radius:12px;padding:20px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                        <h3 style="color:var(--accent-primary);margin-bottom:15px;">📊 Most Posts</h3>
                        ${byPosts.length > 0 ? byPosts.map((item, idx) => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:${idx === 0 ? 'rgba(255,215,0,0.1)' : 'rgba(0,0,0,0.02)'};border-radius:8px;margin-bottom:8px;">
                                <div>
                                    <span style="font-weight:bold;margin-right:8px;">#${idx + 1}</span>
                                    <span onclick="openUserProfile('${item.user}')" style="cursor:pointer;color:var(--accent-primary);text-decoration:underline;">${escapeHtml(item.user)}</span>
                                    ${renderVerifiedBadge(item.user)}
                                    ${renderLevelBadge(item.user)}
                                </div>
                                <div style="font-weight:bold;color:var(--accent-primary);">${item.count} posts</div>
                            </div>
                        `).join('') : '<p style="color:var(--text-meta);text-align:center;">No data yet</p>'}
                    </div>

                    <!-- Rating Leaderboard -->
                    <div style="background:var(--bg-card);border-radius:12px;padding:20px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                        <h3 style="color:var(--accent-primary);margin-bottom:15px;">⭐ Highest Rated</h3>
                        ${byRating.length > 0 ? byRating.map((item, idx) => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:${idx === 0 ? 'rgba(255,215,0,0.1)' : 'rgba(0,0,0,0.02)'};border-radius:8px;margin-bottom:8px;">
                                <div>
                                    <span style="font-weight:bold;margin-right:8px;">#${idx + 1}</span>
                                    <span onclick="openUserProfile('${item.user}')" style="cursor:pointer;color:var(--accent-primary);text-decoration:underline;">${escapeHtml(item.user)}</span>
                                    ${renderVerifiedBadge(item.user)}
                                    ${renderLevelBadge(item.user)}
                                </div>
                                <div style="font-weight:bold;color:var(--accent-primary);">⭐ ${item.avgRating}</div>
                            </div>
                        `).join('') : '<p style="color:var(--text-meta);text-align:center;">No data yet (need 3+ ratings)</p>'}
                    </div>
                </div>
            `;
        }

        // 4. TOGGLE MORE ACTIONS
        function toggleMoreActions(postId) {
            const moreDiv = document.getElementById(`more-${postId}`);
            if (!moreDiv) return;
            
            const isHidden = moreDiv.style.display === 'none';
            moreDiv.style.display = isHidden ? 'block' : 'none';
        }

        // ========================================
        // END OF PHASE 5 FEATURES (Part 1)
        // ========================================

        // ========================================
        // ========================================


        window.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            await loadData();
            checkAuth();
        });
