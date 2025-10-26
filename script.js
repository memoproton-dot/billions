// Helper function to get all possible media paths
function getMediaPaths(id, type) {
    const folder = 'images-videos';
    if (type === 'image') {
        const extensions = ['png', 'gif'];
        return extensions.map(ext => `${folder}/${id}.${ext}`);
    } else if (type === 'video') {
        const extensions = ['mp4'];
        return extensions.map(ext => `${folder}/${id}.${ext}`);
    }
    return [];
}

// Try to load image with multiple extensions and multi-part support
function tryLoadImage(id, callback) {
    const paths = getMediaPaths(id, 'image');
    let currentIndex = 0;
    
    // Check for multi-part images (e.g., 106(1).png and 106(2).png)
    const folder = 'images-videos';
    const extensions = ['png', 'gif'];
    let multiPartIndex = 0;
    
    function tryMultiPart() {
        if (multiPartIndex >= extensions.length) {
            // No multi-part found, try regular image
            tryNext();
            return;
        }
        
        const ext = extensions[multiPartIndex];
        const img1 = new Image();
        
        img1.onload = function() {
            // Found multi-part image, check for second part
            const img2 = new Image();
            img2.onload = function() {
                console.log('Multi-part images loaded for tweet', id);
                callback({ type: 'multi', paths: [img1.src, img2.src] });
            };
            img2.onerror = function() {
                // Only first part exists
                callback({ type: 'single', path: img1.src });
            };
            img2.src = `${folder}/${id}(2).${ext}`;
        };
        
        img1.onerror = function() {
            // Try next extension
            multiPartIndex++;
            tryMultiPart();
        };
        
        img1.src = `${folder}/${id}(1).${ext}`;
    }
    
    // Try multi-part first
    tryMultiPart();
    
    function tryNext() {
        if (currentIndex >= paths.length) {
            console.warn('No valid image found for tweet', id, '- showing placeholder');
            callback('placeholder');
            return;
        }
        
        const img = new Image();
        const path = paths[currentIndex];
        
        const timeout = setTimeout(() => {
            console.log('Timeout loading:', path, '- trying next extension');
            currentIndex++;
            tryNext();
        }, 500);
        
        img.onload = function() {
            clearTimeout(timeout);
            console.log('Image loaded successfully:', path);
            callback({ type: 'single', path: path });
        };
        
        img.onerror = function() {
            clearTimeout(timeout);
            console.log('Failed to load:', path, '- trying next extension');
            currentIndex++;
            tryNext();
        };
        
        img.src = path;
    }
}

// Try to load video with multiple extensions
function tryLoadVideo(id, callback) {
    const paths = getMediaPaths(id, 'video');
    let currentIndex = 0;
    
    function tryNext() {
        if (currentIndex >= paths.length) {
            console.error('No valid video found for tweet', id);
            callback(null);
            return;
        }
        
        const path = paths[currentIndex];
        const video = document.createElement('video');
        
        video.onloadeddata = function() {
            console.log('Video loaded successfully:', path);
            callback(path);
        };
        
        video.onerror = function() {
            console.log('Failed to load:', path, '- trying next extension');
            currentIndex++;
            tryNext();
        };
        
        video.src = path;
    }
    
    tryNext();
}

// Media Preloader Class for efficient caching and preloading
class MediaPreloader {
    constructor() {
        this.cache = new Map();
        this.preloadQueue = [];
        this.maxCacheSize = 25; // Increased cache size
        this.preloadRange = 8; // Increased preload range (was 3)
        this.loadingPromises = new Map(); // Prevent duplicate loads
        this.preloadTimeout = null; // For delayed preloading
    }
    
    // Preload media for timeline items
    async preloadMedia(timelineData, currentIndex) {
        // Clear any existing preload timeout
        if (this.preloadTimeout) {
            clearTimeout(this.preloadTimeout);
        }
        
        // Immediate preload for nearby items
        const immediateRange = 3;
        const immediateStart = Math.max(0, currentIndex - immediateRange);
        const immediateEnd = Math.min(timelineData.length, currentIndex + immediateRange);
        
        // Delayed preload for distant items
        this.preloadTimeout = setTimeout(() => {
            this.preloadDistantMedia(timelineData, currentIndex);
        }, 500);
        
        // Preload immediate items first
        const immediatePromises = [];
        for (let i = immediateStart; i < immediateEnd; i++) {
            const tweet = timelineData[i];
            
            if (tweet.hasMultipleMedia && tweet.mediaList) {
                tweet.mediaList.forEach(media => {
                    if (media.type === 'image' && !this.cache.has(`img_${media.id}`)) {
                        immediatePromises.push(this.preloadImage(media.id));
                    }
                    if (media.type === 'video' && !this.cache.has(`vid_${media.id}`)) {
                        immediatePromises.push(this.preloadVideo(media.id));
                    }
                });
            } else if (tweet.hasImage && !this.cache.has(`img_${tweet.id}`)) {
                immediatePromises.push(this.preloadImage(tweet.id));
            } else if (tweet.hasVideo && !this.cache.has(`vid_${tweet.id}`)) {
                immediatePromises.push(this.preloadVideo(tweet.id));
            }
        }
        
        // Load immediate items in parallel
        Promise.allSettled(immediatePromises).then(() => {
            console.log(`Immediate preload completed for items ${immediateStart}-${immediateEnd}`);
        });
    }
    
    // Preload distant media items
    async preloadDistantMedia(timelineData, currentIndex) {
        const startIndex = Math.max(0, currentIndex - this.preloadRange);
        const endIndex = Math.min(timelineData.length, currentIndex + this.preloadRange);
        
        const preloadPromises = [];
        
        for (let i = startIndex; i < endIndex; i++) {
            const tweet = timelineData[i];
            
            if (tweet.hasMultipleMedia && tweet.mediaList) {
                tweet.mediaList.forEach(media => {
                    if (media.type === 'image' && !this.cache.has(`img_${media.id}`)) {
                        preloadPromises.push(this.preloadImage(media.id));
                    }
                    if (media.type === 'video' && !this.cache.has(`vid_${media.id}`)) {
                        preloadPromises.push(this.preloadVideo(media.id));
                    }
                });
            } else if (tweet.hasImage && !this.cache.has(`img_${tweet.id}`)) {
                preloadPromises.push(this.preloadImage(tweet.id));
            } else if (tweet.hasVideo && !this.cache.has(`vid_${tweet.id}`)) {
                preloadPromises.push(this.preloadVideo(tweet.id));
            }
        }
        
        // Load in parallel but don't block UI
        Promise.allSettled(preloadPromises).then(() => {
            console.log(`Distant preload completed for items ${startIndex}-${endIndex}`);
        });
    }
    
    // Preload image with caching
    async preloadImage(id) {
        const cacheKey = `img_${id}`;
        
        // Return cached version if available
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        // Prevent duplicate loading
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }
        
        const loadPromise = new Promise((resolve) => {
            const paths = getMediaPaths(id, 'image');
            let currentIndex = 0;
            
            // Check for multi-part images first
            const folder = 'images-videos';
            const extensions = ['png', 'gif'];
            let multiPartIndex = 0;
            
            function tryMultiPart() {
                if (multiPartIndex >= extensions.length) {
                    tryNext();
                    return;
                }
                
                const ext = extensions[multiPartIndex];
                const img1 = new Image();
                
                img1.onload = function() {
                    const img2 = new Image();
                    img2.onload = function() {
                        const result = { type: 'multi', paths: [img1.src, img2.src], images: [img1, img2] };
                        resolve(result);
                    };
                    img2.onerror = function() {
                        const result = { type: 'single', path: img1.src, image: img1 };
                        resolve(result);
                    };
                    img2.src = `${folder}/${id}(2).${ext}`;
                };
                
                img1.onerror = function() {
                    multiPartIndex++;
                    tryMultiPart();
                };
                
                img1.src = `${folder}/${id}(1).${ext}`;
            }
            
            function tryNext() {
                if (currentIndex >= paths.length) {
                    resolve('placeholder');
                    return;
                }
                
                const img = new Image();
                const path = paths[currentIndex];
                
                const timeout = setTimeout(() => {
                    currentIndex++;
                    tryNext();
                }, 300); // Shorter timeout for preloading
                
                img.onload = function() {
                    clearTimeout(timeout);
                    const result = { type: 'single', path: path, image: img };
                    resolve(result);
                };
                
                img.onerror = function() {
                    clearTimeout(timeout);
                    currentIndex++;
                    tryNext();
                };
                
                img.src = path;
            }
            
            tryMultiPart();
        });
        
        this.loadingPromises.set(cacheKey, loadPromise);
        
        try {
            const result = await loadPromise;
            if (result !== 'placeholder') {
                this.cache.set(cacheKey, result);
                this.manageCacheSize();
            }
            this.loadingPromises.delete(cacheKey);
            return result;
        } catch (error) {
            this.loadingPromises.delete(cacheKey);
            return 'placeholder';
        }
    }
    
    // Preload video with caching
    async preloadVideo(id) {
        const cacheKey = `vid_${id}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }
        
        const loadPromise = new Promise((resolve) => {
            const paths = getMediaPaths(id, 'video');
            let currentIndex = 0;
            
            function tryNext() {
                if (currentIndex >= paths.length) {
                    resolve(null);
                    return;
                }
                
                const path = paths[currentIndex];
                const video = document.createElement('video');
                video.preload = 'metadata'; // Only load metadata for preloading
                
                video.onloadedmetadata = function() {
                    resolve({ path: path, video: video });
                };
                
                video.onerror = function() {
                    currentIndex++;
                    tryNext();
                };
                
                video.src = path;
            }
            
            tryNext();
        });
        
        this.loadingPromises.set(cacheKey, loadPromise);
        
        try {
            const result = await loadPromise;
            if (result) {
                this.cache.set(cacheKey, result);
                this.manageCacheSize();
            }
            this.loadingPromises.delete(cacheKey);
            return result;
        } catch (error) {
            this.loadingPromises.delete(cacheKey);
            return null;
        }
    }
    
    // Get cached media
    getCachedImage(id) {
        return this.cache.get(`img_${id}`);
    }
    
    getCachedVideo(id) {
        return this.cache.get(`vid_${id}`);
    }
    
    // Force load media if not cached (for distant tweets)
    async forceLoadMedia(id, type) {
        console.log(`Force loading ${type} for tweet ${id}`);
        if (type === 'image') {
            return await this.preloadImage(id);
        } else if (type === 'video') {
            return await this.preloadVideo(id);
        }
        return null;
    }
    
    // Manage cache size to prevent memory issues
    manageCacheSize() {
        if (this.cache.size > this.maxCacheSize) {
            const entries = Array.from(this.cache.entries());
            // Remove oldest entries (simple LRU approximation)
            const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
            toRemove.forEach(([key, value]) => {
                this.cache.delete(key);
                // Clean up DOM elements if they exist
                if (value.image) {
                    value.image.src = '';
                }
                if (value.images) {
                    value.images.forEach(img => img.src = '');
                }
                if (value.video) {
                    value.video.src = '';
                }
            });
        }
    }
    
    // Clear all cached media
    clearCache() {
        this.cache.forEach((value) => {
            if (value.image) {
                value.image.src = '';
            }
            if (value.images) {
                value.images.forEach(img => img.src = '');
            }
            if (value.video) {
                value.video.src = '';
            }
        });
        this.cache.clear();
        this.loadingPromises.clear();
    }
}

// Initialize global preloader instance
const mediaPreloader = new MediaPreloader();

// Loading state management functions
function showImageLoading() {
    const placeholder = document.getElementById('imageLoadingPlaceholder');
    if (placeholder) {
        placeholder.classList.remove('hidden');
    }
}

function hideImageLoading() {
    const placeholder = document.getElementById('imageLoadingPlaceholder');
    if (placeholder) {
        placeholder.classList.add('hidden');
    }
}

function showVideoLoading() {
    const overlay = document.getElementById('videoLoadingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function hideVideoLoading() {
    const overlay = document.getElementById('videoLoadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Ensure Billions logo is visible during loading
function ensureProfilePictureVisible() {
    const avatarImg = document.querySelector('.avatar img');
    if (avatarImg) {
        // Ensure the logo is visible and loaded
        avatarImg.src = 'logo.jpg';
        avatarImg.style.display = 'block';
        avatarImg.style.opacity = '1';
        avatarImg.style.width = '100%';
        avatarImg.style.height = '100%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.style.borderRadius = '50%';
        
        // Force image reload to ensure it's visible
        avatarImg.onload = function() {
            console.log('Billions profile picture loaded successfully');
        };
        avatarImg.onerror = function() {
            console.warn('Failed to load Billions profile picture');
        };
        
        console.log('Billions profile picture visibility ensured');
    } else {
        console.warn('Avatar image element not found');
    }
}

// Memory cleanup and performance monitoring
function cleanupMediaMemory() {
    // Clean up unused media elements
    const allImages = document.querySelectorAll('img[src]');
    const allVideos = document.querySelectorAll('video[src]');
    
    // Clean up images that are not currently visible
    allImages.forEach(img => {
        // Skip profile picture and other essential images
        if (img.closest('.avatar') || img.src.includes('logo.jpg') || img.src.includes('favicon')) {
            return; // Don't clean up profile pictures and essential images
        }
        
        if (!img.closest('.side-image-display.active') && 
            !img.closest('.media-overlay.active') &&
            img.src && img.src !== '') {
            // Clear src to free memory
            img.src = '';
        }
    });
    
    // Clean up videos that are not currently visible
    allVideos.forEach(video => {
        if (!video.closest('.media-overlay.active') && 
            video.src && video.src !== '') {
            // Pause and clear video
            video.pause();
            video.currentTime = 0;
            video.src = '';
        }
    });
    
    // Clean up preloader cache
    mediaPreloader.manageCacheSize();
    
    console.log('Media memory cleanup completed (profile pictures preserved)');
}

// Performance monitoring
function trackMediaPerformance() {
    if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach(entry => {
                if (entry.name.includes('image') || entry.name.includes('video')) {
                    console.log(`Media load time: ${entry.duration}ms for ${entry.name}`);
                }
            });
        });
        observer.observe({ entryTypes: ['resource'] });
    }
}

// Initialize performance monitoring
trackMediaPerformance();

// Periodic cleanup every 30 seconds
setInterval(cleanupMediaMemory, 30000);

// Timeline Data
const timelineData = [
    {
        id: 1,
        date: "Mar 25, 2025",
        month: "March",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions Discord community is officially OPEN\n\nAnd for the next 24 hours, you can claim the Early Adopter role\n\nDon't miss your chance to help shape the Global Human and AI Network from day one!\n\nJump in now -> discord.gg/billions-ntwk",
        eventSummary: "Discord Community Launch - Early Adopter role available for 24 hours",
        hasImage: true,
        hasVideo: false,
        likes: "3.2K",
        retweets: "1.8K",
        replies: "956"
    },
    {
        id: 2,
        date: "Mar 26, 2025",
        month: "March",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We just hit 100,000 on Discord\n\nThank you all for being part of this amazing community!",
        eventSummary: "Major Milestone - 100,000 Discord members reached",
        hasImage: true,
        hasVideo: false,
        likes: "8.5K",
        retweets: "3.2K",
        replies: "2.1K"
    },
    {
        id: 3,
        date: "Mar 28, 2025",
        month: "March",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Today, we're excited to release our technical report \"Deep Trust: Verifiable Identity and Reputation for AI Agents\"\n\nJust as Bitcoin solved the crisis of trust in finance, Deep Trust solves the crisis of trust in AI.\n\nThis release also kicks off Phase 1 of our vision: The Human and AI Internet 👇🧵",
        eventSummary: "Deep Trust Technical Report Released - Phase 1 of Human & AI Internet begins",
        hasImage: true,
        hasVideo: false,
        likes: "12.3K",
        retweets: "5.1K",
        replies: "3.8K"
    },
    {
        id: 4,
        date: "Mar 29, 2025",
        month: "March",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We're experiencing temporary issues on our platform as traffic skyrocketed — our team's on it 🛠️\n\nThanks for bearing with us as we grow!",
        eventSummary: "Platform Traffic Surge - Temporary service issues due to overwhelming community growth",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "evin",
        quoteHandle: "@provenauthority",
        quoteVerified: true,
        quoteText: "We are overwhelmed by the community's growing excitement for @billions_ntwk\n\nThe amount of traffic temporarily crushed some of our APIs & services this week...",
        likes: "9.7K",
        retweets: "4.2K",
        replies: "2.9K"
    },
    {
        id: 5,
        date: "Apr 1, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🚨NEW TASKS UNLOCKED🚨\n\nYep, more ways to level up just dropped🔥\n\nJoin our Discord community 👉: discord.gg/billions-ntwk\nTap in signup.billions.network\n\nTogether, we're building the first Human & AI Network.",
        eventSummary: "New Tasks Released - More ways to engage and level up in the community",
        hasImage: true,
        hasVideo: false,
        likes: "15.8K",
        retweets: "6.5K",
        replies: "4.3K"
    },
    {
        id: 6,
        date: "Apr 1, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🚨 NEW TASKS UNLOCKED 🚨\n\nYep, more ways to level up just dropped 💥\n\nJoin our Discord community: discord.gg/billions-ntwk\nTap in 👉 signup.billions.network\n\nTogether, we're building the first Human & AI Network.",
        eventSummary: "New Tasks Unlocked - More ways to level up and earn",
        hasImage: true,
        hasVideo: false,
        likes: "11.2K",
        retweets: "4.5K",
        replies: "3.1K"
    },
    {
        id: 7,
        date: "Apr 1, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Half a million and counting, what a ride!\n\nA huge thank you to everyone in our Billions community for fueling the Human and AI network.\n\nWe're just getting started.",
        eventSummary: "500K Milestone - Community growth celebration",
        hasImage: true,
        hasVideo: false,
        likes: "908",
        retweets: "195",
        replies: "105"
    },
    {
        id: 8,
        date: "Apr 2, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "You made fire content for Billions? We wanna see it! 👇",
        eventSummary: "Creator Callout - Community content showcase",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Ron",
        quoteHandle: "@onchainron",
        quoteVerified: true,
        quoteText: "Calling all creators in the @billions_ntwk community 🔥\n\nDrop your best memes, tweets, and designs in our Discord: discord.gg/billions-ntwk\n...",
        likes: "545",
        retweets: "153",
        replies: "102"
    },
    {
        id: 9,
        date: "Apr 3, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We have big news...\n\nWe just hit 500k signups, 300k followers on X and 200k members in our Discord community🎉\n\nRegister now 👉 link.intract.io/7jd1qz\n\nAnd we're teaming up with @IntractQuests for a special campaign:\n\n⚡ Earn 300 power points for each user!",
        eventSummary: "Major Milestone + Intract Partnership - 500k signups, special campaign launched",
        hasImage: true,
        hasVideo: false,
        likes: "12K",
        retweets: "35K",
        replies: "2.3K"
    },
    {
        id: 10,
        date: "Apr 5, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "\"What we launched is the ability to assign a unique identifier to an AI agent, and relate that to a human\" – @provenauthority, on the Deep Trust framework.\n\nBillions is creating a trust framework that makes AI:\n✅ Unique\n✅ Verifiable\n✅ Assignable\n\nIt's how AI begins to work with us, not just for us.",
        eventSummary: "Deep Trust Framework Explained - AI identity and verification system",
        hasImage: false,
        hasVideo: true,
        likes: "542",
        retweets: "115",
        replies: "98"
    },
    {
        id: 11,
        date: "Apr 5, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "B is for Bringing creators, agents, and incentives into one trusted ecosystem.\n\n@niravmurthy is building the onchain IP layer for the AI era.\n\n@Campnetworkxyz ensures agents get access, and humans get credit.\n\nBillions makes it all verifiable. That's how we build a better global trust economy.",
        eventSummary: "Ecosystem Vision - Creators, agents, and incentives unified",
        hasImage: true,
        hasVideo: false,
        likes: "711",
        retweets: "198",
        replies: "98"
    },
    {
        id: 12,
        date: "Apr 9, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The AI economy has a $500B opportunity. As @Sequoia has pointed out, it's not just about GPUs:\n\n🤖 Agents can't prove their identity\n🙋 No one knows who owns them\n😬 And we don't know if we can trust them\n\nNo identity → no reputation → no revenue.\n\nDeep Trust solves this.\n\nsequoiacap.com/article/ais-60...",
        eventSummary: "AI Economy Problem Statement - Deep Trust as the solution",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "Today, we're excited to release our technical report \"Deep Trust: Verifiable Identity and Reputation for AI Agents\"\n\nJust as Bitcoin solved the crisis of trust in finance, Deep Trust solves the crisis of trust in AI....",
        likes: "31.2K",
        retweets: "12.8K",
        replies: "9.1K"
    },
    {
        id: 13,
        date: "Apr 11, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Most people still think of AI as something scary. And... that's fair.\n\nBut what if we looked at it differently?\n\nWhat if your AI agent could show that it's real, truly yours, and trustworthy?\n\n🎥 Billions CEO, @provenauthority explains it best.\n\nThat's what the Deep Trust framework is all about:",
        eventSummary: "Deep Trust Vision - CEO explains trustworthy AI framework",
        hasImage: false,
        hasVideo: true,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "Today, we're excited to release our technical report \"Deep Trust: Verifiable Identity and Reputation for AI Agents\"",
        likes: "19.8K",
        retweets: "7.6K",
        replies: "5.3K"
    },
    {
        id: 14,
        date: "Apr 11, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Massive shoutout to our amazing Billions community creators 😊\n\nYou're shaping the future of humans and AI.\n\nWe're celebrating the winners' impact with the OG role on Discord 🏆\n\nCurious who made it? 👇",
        eventSummary: "Community Creators Celebration - OG role winners announced",
        hasImage: true,
        hasVideo: false,
        likes: "734",
        retweets: "215",
        replies: "98"
    },
    {
        id: 15,
        date: "Apr 12, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "B is for Builders\nProving everything, without revealing anything.\n\n@Francis_Berwa from @zkPass is rocking the B with us.\n\nBoth ZKPass and Billions use Zero-Knowledge Proofs to verify what matters, without revealing what doesn't.\n\nWhere should the B show up next? 👁️",
        eventSummary: "ZKPass Partnership - Zero-Knowledge Proofs collaboration",
        hasImage: true,
        hasVideo: false,
        likes: "657",
        retweets: "129",
        replies: "106"
    },
    {
        id: 16,
        date: "Apr 15, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Going live later today! We're talking about the first phase of our roadmap: The Human and AI Internet.\n\nWhat it means. Why it matters. Where we're going.\n\nWith @BrianSeong99, @keepitprivado & @provenauthority\n\nTune in 👇",
        eventSummary: "Roadmap Discussion - Live session on Human and AI Internet",
        hasImage: false,
        hasVideo: false,
        hasSpaces: true,
        spacesTitle: "Deep Trust: Identity and Reputation for AI",
        spacesInfo: "3.4K tuned in · Apr 15 · 55:37",
        likes: "474",
        retweets: "196",
        replies: "116"
    },
    {
        id: 17,
        date: "Apr 16, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "\"Privacy is not about standing apart. It's about standing together.\" 👏\n\nAI is accelerating, data collection is everywhere. Privacy is no longer optional: it's how we protect freedom, prevent abuse, and create real progress.",
        eventSummary: "Privacy Statement - Philosophy on data protection and freedom",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "vitalik.eth",
        quoteHandle: "@VitalikButerin",
        quoteVerified: true,
        quoteText: "Why I support privacy:\n\nvitalik.eth.timo/general/2025/0...",
        likes: "354",
        retweets: "88",
        replies: "37"
    },
    {
        id: 18,
        date: "Apr 20, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "B is for Bridging the gap between creation and capital, art and tech, humans and AI.\n\n@TheDegenesse isn't just building equity, she's designing the blueprint.\n\nFrom @worldofwomenxyz to Web3 at large, the future she's creating is inclusive by design.\n\nWe're here for it.",
        eventSummary: "B is for Bridging - Highlighting inclusive Web3 builders",
        hasImage: true,
        hasVideo: false,
        likes: "888",
        retweets: "243",
        replies: "278"
    },
    {
        id: 19,
        date: "Apr 23, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Can you really trust the agent you're talking to? 🤔\n\nWith the Deep Trust Framework, that's now possible. AI agents can prove who they are, act on your behalf, and make real, trusted coordination possible online.\n\nHere's a quick breakdown 👇",
        eventSummary: "Deep Trust Explainer - Framework breakdown infographic",
        hasImage: true,
        hasVideo: false,
        likes: "420",
        retweets: "109",
        replies: "42"
    },
    {
        id: 20,
        date: "Apr 25, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Big news for digital trust in Europe 🇪🇺\n\nOur tech infrastructure, @PrivadoID, joins the European Blockchain Sandbox with a ZK-powered age verification pilot\n\nProof that user privacy and regulation can coexist.",
        eventSummary: "EU Blockchain Sandbox - Privado ID partnership announcement",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Privado ID (formerly Polygon ID)",
        quoteHandle: "@PrivadoID",
        quoteVerified: true,
        quoteText: "BREAKING: Privado ID selected for the EU Blockchain Sandbox! 🇪🇺\n\nIn partnership with @Privately_app we're piloting AI + ZKP age estimation for Web3 platforms with age-gated content.\n...",
        likes: "1.4K",
        retweets: "856",
        replies: "316"
    },
    {
        id: 21,
        date: "Apr 25, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "",
        eventSummary: "Deep Trust Article - Can you really trust AI agents?",
        hasImage: false,
        hasVideo: false,
        hasArticle: true,
        articleImage: "images-videos/21.png",
        articleTitle: "Can You Really Trust AI Agents?",
        articleDescription: "AI is quickly becoming part of the way we use the internet. Agents are trading assets, joining DAOs, building apps, providing support, and even interfacing with other agents. They're fast, scalable,...",
        likes: "1.4K",
        retweets: "856",
        replies: "316"
    },
    {
        id: 22,
        date: "Apr 27, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "B is for Broadcasting what matters.\n\nFrom college crypto clubs to one of the hottest pods in Web3: @ayyyeandy & @robbie_rollup hit record at @therollupco, broke it down, and brought everyone with them.\n\nThat's why we listen.",
        eventSummary: "B is for Broadcasting - Highlighting The Rollup podcast",
        hasImage: true,
        hasVideo: false,
        likes: "844",
        retweets: "211",
        replies: "225"
    },
    {
        id: 23,
        date: "Apr 29, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Our CEO & cofounder Evin McMullen @provenauthority will be at POLYMOVIA @token2049, talking about how Billions scales trust between humans + AI.\n\nWho's ready to catch the B there?",
        eventSummary: "Token2049 POLYMOVIA - CEO speaking engagement",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Tria",
        quoteHandle: "@useTria",
        quoteVerified: true,
        quoteText: "Join Tria, @0xPolygon and @movementlabsxyz for Polymovia — a Stablecoin, AI, VM and Payments event @ Token2049 Dubai.\n\n📍 29th April, Tue from 5-8 PM at the Theatre of Digital Arts.\n...",
        likes: "397",
        retweets: "72",
        replies: "59"
    },
    {
        id: 24,
        date: "Apr 30, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The Billions Network team is on the ground at @token2049 🇦🇪\n\nIf you're building to scale trust in the AI era, let's connect!\n\nCatch us IRL. Details below 👇",
        eventSummary: "Token2049 Dubai - Team on the ground",
        hasImage: true,
        hasVideo: false,
        likes: "1K",
        retweets: "253",
        replies: "148"
    },
    {
        id: 25,
        date: "Apr 30, 2025",
        month: "April",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "New feature live: Promo Codes! 🏷️\n\nWe've hidden a secret code in our Discord! But it's only live for 1 week and it's worth 400 points 😊\n\nFind it inside promo-codes channel → discord.gg/billions-ntwk\n\nRedeem it here → signup.billions.network\n\nFirst clue: B•••••••••N 👀",
        eventSummary: "Promo Codes Launch - Secret code hunt in Discord",
        hasImage: true,
        hasVideo: false,
        likes: "2.5K",
        retweets: "1.1K",
        replies: "600"
    },
    {
        id: 26,
        date: "May 1, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "On our roadmap, Identity comes first — Reputation follows.\n\nThe goal? A global trust economy where humans + agents can earn, interact, and build without compromise.\n\nJust like Billions CEO Evin McMullen (@provenauthority) said loud and clear on stage.",
        eventSummary: "Roadmap Vision - Identity first, reputation follows",
        hasImage: false,
        hasVideo: true,
        likes: "901",
        retweets: "199",
        replies: "136"
    },
    {
        id: 27,
        date: "May 2, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "New promo codes... and new fresh look!\n\nThe Billions portal just got a glow-up ✨\n\nCheck it out → signup.billions.network",
        eventSummary: "Portal Redesign - New UI and promo codes",
        hasImage: false,
        hasVideo: true,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "New feature live: Promo Codes! 🏷️\n\nWe've hidden a secret code in our Discord! But it's only live for 1 week and it's worth 400 points 😊\n...",
        likes: "1K",
        retweets: "330",
        replies: "274"
    },
    {
        id: 28,
        date: "May 4, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "B is for Bringing stablecoins to everyone.\n\n@ben_solstice is building it with @solstice_io\n\n+$100M in TVL and still just getting started 🔥\n\nLet's bring stablecoins to the next billion.",
        eventSummary: "B is for Bringing - Solstice stablecoin partnership",
        hasImage: true,
        hasVideo: false,
        likes: "1K",
        retweets: "143",
        replies: "175"
    },
    {
        id: 29,
        date: "May 5, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Dubai nights, big ideas at POLYMOVIA ✨\n\nAn inspiring evening diving into AI, stablecoins, and decentralized innovation.\n\nBillions was proud to join and showcase our mobile-first, privacy-led approach to scale trust among humans & AI 🤝🤖",
        eventSummary: "POLYMOVIA Recap - Dubai event highlights",
        hasImage: true,
        hasVideo: false,
        likes: "2.2K",
        retweets: "915",
        replies: "804"
    },
    {
        id: 30,
        date: "May 7, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "📣 Happening Today — The first-ever Billions AMA\n🎯 5PM CET\n\nDon't miss your chance to connect with the team and get the latest on:\n\n👁️ Vision — Evin (CEO)\n💬 Community — Javi (Community Lead)\n📣 Marketing — Alex (CMO)\n🤝 Partnerships — Ravi (Growth Director)\n\nJoin us & ask anything → discord.gg/billions-ntwk",
        eventSummary: "First Billions AMA - Team Q&A session",
        hasImage: true,
        hasVideo: false,
        likes: "607",
        retweets: "126",
        replies: "106"
    },
    {
        id: 31,
        date: "May 8, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "New competition for content creators!\n\nCreate a piece of content showing us you're a real human: a thread, video, pic, meme, anything goes.\n\nWe'll pick 10 winners to earn 700 power each! 💵\n\nHere's how to join:\n• Add your referral link in your post\n• Tag @billions_ntwk and use the hashtag #billionsofhumans\n• Ends May 15th! 🚨",
        eventSummary: "Content Creator Competition - Prove you're human challenge",
        hasImage: true,
        hasVideo: false,
        likes: "1.9K",
        retweets: "809",
        replies: "716"
    },
    {
        id: 32,
        date: "May 9, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions is joining the @IntractLabs Proof of Humanity ecosystem 🔥\n\nWe're bringing mobile-first verification to Intract quests — so real people get rewards, not bots.\n\nMore trust. More rewards. More reasons to verify.\n\nStay tuned!",
        eventSummary: "Intract Partnership - Proof of Humanity ecosystem",
        hasImage: true,
        hasVideo: false,
        likes: "3K",
        retweets: "1.5K",
        replies: "956"
    },
    {
        id: 33,
        date: "May 10, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Think you're human? Prove it and get rewarded.\n\nWhat to do:\n\n– Post a video, pic, voice note, or text proving you're human\n– Include your referral link\n– Tag @billions_ntwk and use the hashtag #billionsofhumans\n\n🏆 10 winners will each earn 700 points\n📅 Deadline: May 15th\n\nLet's show the world what real humans look like.",
        eventSummary: "Prove You're Human - Content competition details",
        hasImage: true,
        hasVideo: false,
        likes: "2.1K",
        retweets: "1.3K",
        replies: "750"
    },
    {
        id: 34,
        date: "May 11, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "B is for the Beginning of what's next 💡\n\nAt Token2049, the B landed in the right hands: builders shaping the future where trust scales with us.",
        eventSummary: "Token2049 Recap - B in the right hands",
        hasImage: true,
        hasVideo: false,
        likes: "1.8K",
        retweets: "644",
        replies: "549"
    },
    {
        id: 35,
        date: "May 12, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "AI agents are already here.\n\nBut trust? Still a work in progress.\n\nBillions is building the foundation for a world where humans and agents can interact and work with trust.\n\nWatch our CEO & Co-founder, Evin, break it down 🧪",
        eventSummary: "AI Trust Vision - CEO explains the foundation",
        hasImage: false,
        hasVideo: true,
        likes: "1.6K",
        retweets: "591",
        replies: "457"
    },
    {
        id: 36,
        date: "May 13, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "📣 Happening Today: Identity for the Avax Ecosystem\n\nJoin us today at 12:30 PM CET on X Spaces with leaders from @0xZeeve, @Avax and @billions_ntwk\n\n🎤 Speakers:\n• @rpchamria (Zeeve)\n• @MittalDevika (Avalanche)\n• @ravikantagrawal (Billions)\n\nLink to Spaces below 👇",
        eventSummary: "Avax Ecosystem Identity - X Spaces discussion",
        hasImage: true,
        hasVideo: false,
        likes: "1.6K",
        retweets: "518",
        replies: "395"
    },
    {
        id: 37,
        date: "May 14, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We just hit +800,000 participants on the Billions Network!\n\nLooks like humans and AI are better together 🙂🤝🤖\n\nTo celebrate, we've got a surprise:\nUse promo code BILLIONS800K and claim 400 power points, valid for the next 24 hours only.",
        eventSummary: "800K Milestone - Promo code celebration",
        hasImage: true,
        hasVideo: false,
        likes: "3.2K",
        retweets: "1.9K",
        replies: "2.1K"
    },
    {
        id: 38,
        date: "May 18, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions: growing the first human & AI network 🚀",
        eventSummary: "Growth Update - Network expansion",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Javi🌊.eth",
        quoteHandle: "@jgonzalezferrer",
        quoteVerified: true,
        quoteText: "time really flies! 😊\n\nlast 2 months have been all about growing 🚀:\n\n@billions_ntwk is now 800K+ users, =400K followers, 300K+ Discord...",
        likes: "1.8K",
        retweets: "559",
        replies: "538"
    },
    {
        id: 39,
        date: "May 20, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Trust is the new intelligence.\n\n@billions_ntwk and @lagrangedev's DeepProve power the first human + AI network with verifiable integrity.\n\nWe're unlocking:\n✅ Real-time human-AI trust\n✅ Verified agents & actions\n✅ Proof-based reputation\n\nLearn more below 👇",
        eventSummary: "Lagrange Partnership - DeepProve integration",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "LAGRANGE",
        quoteHandle: "@lagrangedev",
        quoteVerified: true,
        quoteText: "An AI-powered internet needs more than just intelligence — it needs trust\n\n@billions_ntwk and DeepProve is bringing verifiable integrity to the world's first human + AI network: 📡",
        likes: "1.7K",
        retweets: "553",
        replies: "417"
    },
    {
        id: 40,
        date: "May 22, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The Coinbase data leak was completely avoidable.\n\nCompanies need to stop leaking people's data\n\nThis breach is another reminder: placing your personal data in a centralized company's hands makes it an irresistible target for attackers\n\nZK tech is how we fix this.\n\n📡👇",
        eventSummary: "Data Privacy Statement - Coinbase breach commentary",
        hasImage: true,
        hasVideo: false,
        likes: "1.7K",
        retweets: "553",
        replies: "417"
    },
    {
        id: 41,
        date: "May 22, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions is joining @auroraisnear to support the next generation of builders 💪\n\nWant to ship your own chain in 2025? Let's talk about what it takes.\n\nTune into this Space later today 👇",
        eventSummary: "Aurora Partnership - Supporting builders",
        hasImage: false,
        hasVideo: false,
        hasSpaces: true,
        spacesTitle: "Details not available",
        spacesInfo: "",
        likes: "380",
        retweets: "74",
        replies: "57"
    },
    {
        id: 42,
        date: "May 23, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "400 power point on the line 🔥\n\nWe've dropped a new promo code in our Discord!\n\n🔍 Find it in channel promo-codes → discord.com/billions-ntwk\n🎯 Redeem here → signup.billions.network\n\nFirst clue: It starts with B 👀",
        eventSummary: "Promo Code Drop - Discord treasure hunt",
        hasImage: true,
        hasVideo: false,
        likes: "2.3K",
        retweets: "1.1K",
        replies: "636"
    },
    {
        id: 43,
        date: "May 25, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Backseat? Not his style.\nHe's up front, where the builders are.\nWhere blockchains scale.\nWhere momentum starts.\n\n@0x_dingus held the B the way infra should feel: effortless.\n\nSocial moves fast. @BuildOnCyber moves faster.",
        eventSummary: "B is for Builders - Cyber network highlight",
        hasImage: true,
        hasVideo: false,
        likes: "844",
        retweets: "211",
        replies: "225"
    },
    {
        id: 44,
        date: "May 27, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Two weeks ago: Coinbase, breached.\nLast week: 184 million user passwords from Google, Apple, Meta, and others were leaked.\n\nThe pattern is clear — centralized data storage is fundamentally broken.\n\nYour financial records, private photos, location and sensitive data shouldn't be anyone's business but your own.\n\nWith Billions, no data stored means no data leaked — ever. Control over your data isn't a feature, it's a right.",
        eventSummary: "Data Breach Commentary - Privacy rights statement",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "The Coinbase data leak was completely avoidable.\n\nCompanies need to stop leaking people's data\n\nThis breach is another reminder: placing your personal...",
        likes: "1.7K",
        retweets: "553",
        replies: "417"
    },
    {
        id: 45,
        date: "May 27, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The first universal network built for Humans and AI 🙂🤝🤖",
        eventSummary: "Network Vision - Universal human & AI network",
        hasImage: true,
        hasVideo: false,
        likes: "969",
        retweets: "144",
        replies: "168"
    },
    {
        id: 46,
        date: "May 29, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Our CEO and cofounder Evin @provenauthority spoke with @YahooFinance about the Coinbase breach.\n\nOutdated systems can't keep your personal data safe.\n\nThe future is privacy-first, and we're working hard to move things forward 💪\n\nCheck out the story: finance.yahoo.com/news/coinbase-...",
        eventSummary: "Yahoo Finance Interview - CEO on data privacy",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "The Coinbase data leak was completely avoidable.\n\nCompanies need to stop leaking people's data\n\nThis breach is another reminder: placing your personal data in a ...",
        likes: "432",
        retweets: "76",
        replies: "55"
    },
    {
        id: 47,
        date: "May 29, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The Genesis of Billions\n\nTomorrow🔥",
        eventSummary: "Genesis Teaser - Major announcement incoming",
        hasImage: false,
        hasVideo: false,
        likes: "724",
        retweets: "84",
        replies: "99"
    },
    {
        id: 48,
        date: "May 30, 2025",
        month: "May",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions cooking mode: activated",
        eventSummary: "Team Cooking - Behind the scenes",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Javi🌊.eth",
        quoteHandle: "@jgonzalezferrer",
        quoteVerified: true,
        quoteText: "The Billions team is cooking 👨‍🍳\n\nThis is truly the most talented team I've ever been part of. Worth billions!!",
        likes: "3.6K",
        retweets: "1.5K",
        replies: "1.1K"
    },
    {
        id: 49,
        date: "Jun 1, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "B is for the beauty we choose to preserve.\nB is for the belief that digital is real.\n\nRick and the team at @atomicform made sure digital could last.\n\nEvin, with the minds behind @Billions_ntwk, built a way for trust to scale.\n\nA reminder that art and identity both deserve permanence ✨",
        eventSummary: "B is for Beauty - Atomic Form partnership",
        hasImage: true,
        hasVideo: false,
        likes: "1K",
        retweets: "131",
        replies: "251"
    },
    {
        id: 50,
        date: "Jun 3, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Flower power time 🌸💪\n\n@Arichain_ × Billions invite you to this AI vs HANDMADE contest!\n\nTop creators win a Genesis NFT whitelist spot.\n\nDetails below 👇",
        eventSummary: "Arichain Contest - AI vs Handmade art competition",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Arichain",
        quoteHandle: "@Arichain_",
        quoteVerified: true,
        quoteText: "Arichain X Billions Community Collaboration Event\n\nArichain and the Billions project are hosting a joint Creator event!\n\n- Theme: AI ART VS Hand Made ART  ...\nShow more",
        likes: "1K",
        retweets: "240",
        replies: "192"
    },
    {
        id: 51,
        date: "Jun 4, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Ready for a power boost? 💥\n\nNEW TASK: Bring new friends to Billions and help grow a verified Human & AI network.\n\n👥 1 referral = 100 extra points\n👥 3 referrals = 600 extra points\n\nStart referring & level up your rewards.\n👉 signup.billions.network",
        eventSummary: "Referral Task - New rewards program",
        hasImage: false,
        hasVideo: true,
        likes: "1.4K",
        retweets: "1.2K",
        replies: "479"
    },
    {
        id: 52,
        date: "Jun 5, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Today's Spaces! Is NFT season back?\n\nHow NFT communities grow, how they thrive, and what's next 💨\n\nIf you care about community, culture, or just good NFTs, don't miss it!\n\nLink below 👇",
        eventSummary: "NFT Season Spaces - Community discussion",
        hasImage: true,
        hasVideo: false,
        likes: "1.6K",
        retweets: "1.1K",
        replies: "1.5K"
    },
    {
        id: 53,
        date: "Jun 6, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions 🤝 Aurora\n\nWe're teaming up with @auroraisnear on day one of their Marketplace to make sure real humans and trusted AI are part of every launch – faster shipping and deeper trust.\n\n1000 chains? We're ready. Let's build!",
        eventSummary: "Aurora Marketplace - Day one partnership",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Aurora",
        quoteHandle: "@auroraisnear",
        quoteVerified: true,
        quoteText: "Everyone deserves a chain.\n200 launched. 1,000 coming.\nAnd now, they're launching with more than Aurora & @NEARProtocol\nThey are launching with the best of Web3, already plugged in.\n...",
        likes: "441",
        retweets: "75",
        replies: "67"
    },
    {
        id: 54,
        date: "Jun 6, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "InfoFi is the new meta and Billions is crushing it🔥\n\nThe Billions Leaderboard just went live on @cookiedotfun!\n\ncookie.fun/tokens/billions\n\nBig love to cookie.fun for baking this up 🤝",
        eventSummary: "Cookie.fun Leaderboard - InfoFi integration",
        hasImage: true,
        hasVideo: false,
        likes: "884",
        retweets: "208",
        replies: "234"
    },
    {
        id: 55,
        date: "Jun 6, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Want a Billions Genesis whitelist slot? Prove your creativity 🔥\n\nPost a thread, video, or meme that shows what Billions means to you, and tag @billions_ntwk\n\n🎁 20 winners will make it onto the Genesis whitelist\n⏱️ Deadline: June 8\n\nShow us your Human + AI vibe!",
        eventSummary: "Genesis Whitelist Contest - Creativity challenge",
        hasImage: false,
        hasVideo: false,
        likes: "1.1K",
        retweets: "273",
        replies: "374"
    },
    {
        id: 56,
        date: "Jun 8, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Genesis Whitelist Alert ⚡\n\nAlready verified on the Human and AI Network? Prove it!\n\nDrop a screenshot of your Billions registration\n\nWe'll pick 2 verified humans to get on the WL 😊",
        eventSummary: "Genesis Whitelist Alert - Screenshot verification",
        hasImage: true,
        hasVideo: false,
        likes: "2.9K",
        retweets: "525",
        replies: "2K"
    },
    {
        id: 57,
        date: "Jun 9, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Dive into trust between humans and AI with Billions Network. Live tomorrow on @auroraisnear!👇",
        eventSummary: "Aurora Behind the Stack - Live discussion",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Aurora",
        quoteHandle: "@auroraisnear",
        quoteVerified: true,
        quoteText: "We're kicking off Episode 2 of Behind the Stack, the series spotlighting the partners live on the ACC Marketplace.\n\nTomorrow, we dive into how Billions Network gives Virtual Chains the tools to verify identities, connect users, and build trust between ...\nShow more",
        likes: "378",
        retweets: "61",
        replies: "60"
    },
    {
        id: 58,
        date: "Jun 10, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions Private Testnet is LIVE 🚀\n\nProud to welcome @auroraisnear, @campnetworkxyz, and @0xPolygon – the first ecosystems building on the Human and AI Network.\n\nMobile-first, ZK-verified, and ready to scale trust for Billions.\n\n👇📡",
        eventSummary: "Private Testnet Launch - First ecosystems onboarded",
        hasImage: false,
        hasVideo: true,
        likes: "2.3K",
        retweets: "811",
        replies: "680"
    },
    {
        id: 59,
        date: "Jun 11, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🚨 New mint date: Tuesday, June 17\n\nWe're taking a few extra days to make sure your Billions Genesis mint is flawless 🔥\n\n📍 Minting on @MagicEden\n\nThanks for building this with us 💙",
        eventSummary: "Genesis Mint Date Update - June 17 announcement",
        hasImage: true,
        hasVideo: false,
        likes: "3.5K",
        retweets: "857",
        replies: "529"
    },
    {
        id: 60,
        date: "Jun 13, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Big congrats to our cofounder Sandeep @sandeepnailwal – now leading the charge as CEO of Polygon Foundation 🎉\n\nBuilding trust at scale, leading with vision. This is just the beginning 🔥",
        eventSummary: "Sandeep CEO Announcement - Polygon Foundation leadership",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Sandeep | CEO, Polygon Foundatio...",
        quoteHandle: "@sandeepna...",
        quoteVerified: true,
        quoteText: "BIG update – As the largest holder of POL and someone who dedicated his life to development and success of @0xPolygon from the very beginning, I have decided to take full control of Polygon Foundation and will be its CEO going forward. Polygon Foundation owns and oversees\nShow more",
        likes: "372",
        retweets: "45",
        replies: "84"
    },
    {
        id: 61,
        date: "Jun 14, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "You like early access? Prove it!\n\nWe're taking a whitelist snapshot for FCFS phase this Sunday at 23:59:59 CET\n\nAlready signed up on Billions Network and connected your wallet? You're good ✅\n\nStill not in? Go 👉",
        eventSummary: "FCFS Whitelist Snapshot - Early access announcement",
        hasImage: true,
        hasVideo: false,
        likes: "1.9K",
        retweets: "348",
        replies: "506"
    },
    {
        id: 62,
        date: "Jun 15, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "In a world of autonomous cars and AI copilots:\n\n@DIMO_Network powers the movement, but Billions verifies who's in charge.\n\n@robmsolomon held the B because mobility without verified identity isn't the future, it's a risk.",
        eventSummary: "B is for DIMO - Verified mobility identity",
        hasImage: true,
        hasVideo: false,
        likes: "632",
        retweets: "76",
        replies: "106"
    },
    {
        id: 63,
        date: "Jun 16, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "",
        eventSummary: "Genesis NFT Article - First NFT drop announcement",
        hasImage: false,
        hasVideo: false,
        hasArticle: true,
        articleImage: "images-videos/63.png",
        articleTitle: "Billions Genesis NFT",
        articleDescription: "The very first NFT drop from Billions Network is here: Billions Genesis. Before we welcome billions into our community, we're starting by scouting our early visionaries – the genesis humans who'll...",
        likes: "2.6K",
        retweets: "944",
        replies: "1.6K"
    },
    {
        id: 64,
        date: "Jun 17, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "WL Checker is LIVE 🔥\n\nWant to know if you made it?\n\n🔍 Check your eligibility here: magiceden.io/launchpad/poly...\n\n📅 Mint goes live today June 17",
        eventSummary: "WL Checker Live - Eligibility verification",
        hasImage: true,
        hasVideo: false,
        likes: "1.7K",
        retweets: "272",
        replies: "290"
    },
    {
        id: 65,
        date: "Jun 17, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "MINT IS LIVE 🔥\n\nThe Billions Genesis NFT just dropped on @MagicEden\n\nClaim your piece! Own the \"B\" that scales trust among humans and AI.\n\nMint yours now 👇  magiceden.io/launchpad/poly...\n\nDisclaimer: 1$ platform fee is charged for the mint",
        eventSummary: "Genesis Mint Live - NFT drop on Magic Eden",
        hasImage: true,
        hasVideo: false,
        likes: "795",
        retweets: "184",
        replies: "302"
    },
    {
        id: 66,
        date: "Jun 18, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions Genesis NFT is officially SOLDOUT! 🔥\n\nThank you for believing in a friendly, authentic network built for scale the internet of trust.\n\nGenesis holders → jump into our Discord, verify your NFT and claim your new Genesis role!\n\nGenesis is the start of many more milestones to come 🔥",
        eventSummary: "Genesis NFT Sold Out - Milestone achieved",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "569",
        replies: "665"
    },
    {
        id: 67,
        date: "Jun 20, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Big news for Billions!\n\nWe're proud to announce that Billions has advanced to Stage 2 of the EIC Accelerator 🇪🇺\n\nThe EU's most competitive deep-tech program — and we're getting there with our DeepTrust framework and the @PrivadoID tech stack.",
        eventSummary: "EIC Accelerator Stage 2 - EU deep-tech program advancement",
        hasImage: true,
        hasVideo: false,
        likes: "941",
        retweets: "166",
        replies: "137"
    },
    {
        id: 68,
        date: "Jun 21, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We've officially hit 1 Million 🔥\n\nBig thanks for being here since day zero 🤝\n\nNow, let's go for Billions!",
        eventSummary: "1 Million Milestone - Major community achievement",
        hasImage: false,
        hasVideo: true,
        likes: "2.6K",
        retweets: "847",
        replies: "1.4K"
    },
    {
        id: 69,
        date: "Jun 23, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "AI agents should work together — but only if they know who to trust 🤝\n\nBillions makes identity verifiable so AI agents (and humans) can recognize each other and act responsibly.",
        eventSummary: "AI Agent Trust - Verifiable identity for collaboration",
        hasImage: true,
        hasVideo: false,
        likes: "667",
        retweets: "94",
        replies: "98"
    },
    {
        id: 70,
        date: "Jun 26, 2025",
        month: "June",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Introducing the Billions Mobile App 📱\n\nThe easiest way to verify your humanity privately from your phone, and unlock exclusive future rewards.\n\nReady to prove your humanity?\n\n📡👇",
        eventSummary: "Mobile App Launch - Verify humanity privately",
        hasImage: false,
        hasVideo: true,
        likes: "2.5K",
        retweets: "1.2K",
        replies: "1.4K"
    },
    {
        id: 71,
        date: "Jul 1, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions has entered the chat @EthCC 🇫🇷\n\nWe're here to meet builders, dreamers, and anyone building the future of humans and AI.\n\nCome say hi 👋",
        eventSummary: "EthCC Attendance - Meeting builders in France",
        hasImage: false,
        hasVideo: true,
        likes: "389",
        retweets: "58",
        replies: "70"
    },
    {
        id: 72,
        date: "Jul 2, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Fake accounts are costing you.\n\nTune into our live Spaces with speakers from @0xPolygon, @Intract_HQ, and @Clique2046 as we dive into Billions' latest app launch.\n\n🔔 Set your reminder",
        eventSummary: "Fake Accounts X Spaces - App launch discussion",
        hasImage: false,
        hasVideo: false,
        hasSpaces: true,
        spacesTitle: "Fake accounts are costing you",
        spacesInfo: "1.7K tuned in · Jul 3 · 44:51",
        likes: "1.6K",
        retweets: "537",
        replies: "1.1K"
    },
    {
        id: 73,
        date: "Jul 4, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Show the fact. Hide the data\n\nWith Billions, you can prove you're human, without revealing your private data.\n\nBuilt for privacy. Designed to scale.\n\n📡👇",
        eventSummary: "Privacy Message - Show fact, hide data",
        hasImage: true,
        hasVideo: false,
        likes: "1.7K",
        retweets: "435",
        replies: "474"
    },
    {
        id: 74,
        date: "Jul 6, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Human?\n\nYou should be getting rewarded.\n\nDownload the Billions app, prove you're a human — safely (and privately) — and start earning Power Points on the Billions Network",
        eventSummary: "Rewards for Humans - App download call to action",
        hasImage: true,
        hasVideo: false,
        likes: "1.2K",
        retweets: "176",
        replies: "251"
    },
    {
        id: 75,
        date: "Jul 8, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The Billions website just leveled up 🔥\n\n👉 billions.network",
        eventSummary: "Website Redesign - New billions.network launch",
        hasImage: false,
        hasVideo: true,
        likes: "655",
        retweets: "79",
        replies: "106"
    },
    {
        id: 76,
        date: "Jul 9, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Vitalik nailed the problem:\nIf identity system stays centralized, ZK alone can't stop coercion, identity correlation, or loss of psuedoanonymity.\n\nBut what @VitalikButerin described as ideal is already here:\nLive, available anywhere, and mobile-first 👇\nbillions.network/blog/digital-i...",
        eventSummary: "ZK Identity Solution - Response to Vitalik's essay",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "vitalik.eth",
        quoteHandle: "@VitalikButerin",
        quoteVerified: true,
        quoteText: "Does digital ID have risks even if it's ZK-wrapped?\n\nvitalik.eth.timo/general/2025/0...",
        likes: "559",
        retweets: "120",
        replies: "104"
    },
    {
        id: 77,
        date: "Jul 9, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "This Friday: first-ever Billions party in the metaverse 🥳\n\nWe're teaming up with @Brave and @Decentraland for music, talks, fun, and special wearables.\n\nNo invite needed. Just show up, human 🙂",
        eventSummary: "Metaverse Party - Brave x Billions x Decentraland",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Decentraland",
        quoteHandle: "@decentraland",
        quoteVerified: true,
        quoteText: "Masked but Human\n\nThe official @brave x @billions_ntwk party is happening in Decentraland 🎉\n...",
        likes: "874",
        retweets: "807",
        replies: "326"
    },
    {
        id: 78,
        date: "Jul 10, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Yes, you saw it: new tasks are live 🔥\n\n📱 Download Billions app\n🙂 Prove you're human\n💵 Earn +Power Points on Billions\n\n👉 signup.billions.network",
        eventSummary: "New Tasks Live - App download and verification",
        hasImage: false,
        hasVideo: true,
        likes: "1.5K",
        retweets: "61K",
        replies: "444"
    },
    {
        id: 79,
        date: "Jul 11, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "",
        eventSummary: "Genesis Ambassadors - Application form announcement",
        hasImage: false,
        hasVideo: false,
        hasArticle: true,
        articleImage: "images-videos/79.png",
        articleTitle: "Billions Genesis Ambassadors",
        articleDescription: "Join the Genesis Ambassadors program and help shape the future of the Human and AI Network",
        likes: "1.4K",
        retweets: "669",
        replies: "449"
    },
    {
        id: 80,
        date: "Jul 14, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "You shouldn't have to reintroduce yourself to the internet every day.\n\nIn this new interview with @nowmedia, our CFO & cofounder Evin ( @provenauthority) explains why identity is the next frontier in the AI era.\n\n👇",
        eventSummary: "Identity Interview - CFO on the future of identity",
        hasImage: true,
        hasVideo: false,
        likes: "455",
        retweets: "72",
        replies: "57"
    },
    {
        id: 81,
        date: "Jul 16, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🌍 Verify anywhere, privately. Powered by ZK tech.\n\nYou don't need any special hardware. We built around the most universal device on Earth: your phone.\n\nYour personal data stays private.",
        eventSummary: "Verify Anywhere - Mobile-first privacy solution",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "789",
        replies: "456"
    },
    {
        id: 82,
        date: "Jul 17, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "\"Things are only impossible until they're not\"\n\nKeep building.",
        eventSummary: "Motivation - Keep building message",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "evin",
        quoteHandle: "@provenauthority",
        quoteVerified: true,
        quoteText: "when I started working on ZK verifiable data and identity on Ethereum\n\npeople said it couldn't be done\ntoo expensive\ntoo slow...\nShow more",
        likes: "181",
        retweets: "24",
        replies: "49"
    },
    {
        id: 83,
        date: "Jul 18, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We're proud to join the 3rd cohort of the @EuropeanSandbox 🇪🇺\n\nTogether with @Privately_app and built on our @PrivadoID tech stack, we've created a way to prove you're over 18, without sharing your date of birth, ID, or any personal info.\n\nPrivacy-first ✅ Regulation-ready✅",
        eventSummary: "EU Blockchain Sandbox 3rd Cohort - Age verification solution",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "European Blockchain Sandbox",
        quoteHandle: "@EuropeanSandbox",
        quoteVerified: false,
        quoteText: "📣 Announcing the 3rd cohort regulators and authorities!\n\n👏 The initial list is available to view now on our website:  blockchain-...",
        likes: "1.1K",
        retweets: "789",
        replies: "456"
    },
    {
        id: 84,
        date: "Jul 20, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🛠️ Scheduled Maintenance – Billions Test Network\n\nThis Monday, July 21 – 10:00 CET, we're upgrading the test network (⏳ ~3h).\n\nDuring that time:\n– You won't be able to get or verify credentials\n– Wallet features may be down\n\nPlan ahead. It's all part of making Billions better 💪",
        eventSummary: "Test Network Maintenance - Scheduled upgrade",
        hasImage: false,
        hasVideo: false,
        likes: "649",
        retweets: "89",
        replies: "139"
    },
    {
        id: 85,
        date: "Jul 23, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Community-built Open AGI for Billions of Humans\n\n@Billions_ntwk 🤝 @SentientAGI\n\nWe're building an internet where humans and AI interact, coordinate, and trust each other—privately and at scale.\n\nThe open AGI platform meets the global Human and AI network.",
        eventSummary: "Sentient AGI Partnership - Open AGI collaboration",
        hasImage: false,
        hasVideo: true,
        likes: "1.1K",
        retweets: "798",
        replies: "362"
    },
    {
        id: 86,
        date: "Jul 24, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Not your typical AI Spaces 🤩\n\nJoin us tomorrow to talk open AGI, identity, and building the internet we actually want.\n\n📅 July 24 | 🕒 3PM CET\n🎤 @SentientAGI & @Billions_ntwk\n\n🔔 Set your reminder: x.com/i/spaces/1rmxP...",
        eventSummary: "AI Spaces - Open AGI discussion",
        hasImage: true,
        hasVideo: false,
        likes: "446",
        retweets: "77",
        replies: "88"
    },
    {
        id: 87,
        date: "Jul 24, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "gSenti 👀 @SentientAGI",
        eventSummary: "Sentient Follow - Partnership acknowledgment",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "524",
        replies: "757"
    },
    {
        id: 88,
        date: "Jul 27, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Next week, Billions will move to its next phase.\n\nSomething big is happening.\n\nBe ready. Be watching 👀",
        eventSummary: "Next Phase Teaser - Big announcement coming",
        hasImage: false,
        hasVideo: true,
        likes: "2.4K",
        retweets: "984",
        replies: "858"
    },
    {
        id: 89,
        date: "Jul 27, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "What could possibly be happening in Billions? 👀",
        eventSummary: "Mystery Teaser - What's happening?",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "178",
        replies: "367"
    },
    {
        id: 90,
        date: "Jul 30, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "A new era... needs a new face 👀\n\nSay hello to the new Billions\n\nThe Human and AI Network.",
        eventSummary: "Rebrand Announcement - New Billions identity",
        hasImage: false,
        hasVideo: true,
        likes: "2.4K",
        retweets: "1.1K",
        replies: "1.5K"
    },
    {
        id: 91,
        date: "Jul 31, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Identity verification is the foundation for the human and AI internet.\n\nJoin @ravikantagrawal, our Director of Growth, as he dives into how @billions_ntwk is building trust online👇",
        eventSummary: "WachAI Verification Roundtable - Building trust online",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "WachAI",
        quoteHandle: "@Wach_AI",
        quoteVerified: true,
        quoteText: "Automated by @QuillAI_Network\nVerification Roundtable #2🔎\n\nThe world is going trustless. But not trust-free.\n\nAgents are transacting, protocols are reasoning, machines are making...\nShow more",
        likes: "345",
        retweets: "47",
        replies: "85"
    },
    {
        id: 92,
        date: "Jul 31, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "#NewProfilePic\n\nWho dis? 👀",
        eventSummary: "New Profile Picture - Brand refresh",
        hasImage: true,
        hasVideo: false,
        likes: "1.6K",
        retweets: "157",
        replies: "380"
    },
    {
        id: 93,
        date: "Jul 31, 2025",
        month: "July",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We hadn't announced our past funding... until now!\n\nBillions is proud to share the total capital funding of $30M to build the first universal Human and AI network.",
        eventSummary: "$30M Funding Announcement - Total capital raised",
        hasImage: true,
        hasVideo: false,
        likes: "5.5K",
        retweets: "2.5K",
        replies: "2.5K"
    },
    {
        id: 94,
        date: "Aug 2, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We just hit 500K on X!\n\nThis wouldn't have been possible without you 🤝\n\nThe network is growing, and what's next will be more iconic.",
        eventSummary: "500K Followers - X milestone celebration",
        hasImage: false,
        hasVideo: true,
        likes: "1.9K",
        retweets: "397",
        replies: "536"
    },
    {
        id: 95,
        date: "Aug 4, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "",
        eventSummary: "Being Verified Article - The new superpower in AI era",
        hasImage: false,
        hasVideo: false,
        hasArticle: true,
        articleImage: "images-videos/95.png",
        articleTitle: "Being Verified is the New Superpower",
        articleDescription: "In the age of AI, proving you're human becomes the ultimate advantage",
        likes: "6.6K",
        retweets: "97K",
        replies: "888"
    },
    {
        id: 96,
        date: "Aug 4, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions is now on @KaitoAI! 🤝🌊",
        eventSummary: "Kaito AI Integration - Yapper leaderboard live",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Kaito AI",
        quoteHandle: "@KaitoAI",
        quoteVerified: true,
        quoteText: "The @billions_ntwk Yapper Leaderboard is now live!\n\nWith something extra coming from them later this week 👀\n...",
        likes: "3.1K",
        retweets: "929",
        replies: "1.4K"
    },
    {
        id: 97,
        date: "Aug 6, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The Billions Launchpad is now open on @KaitoAI\n\nLet's go, humans.",
        eventSummary: "Launchpad Open - Public sale on Kaito",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Kaito AI",
        quoteHandle: "@KaitoAI",
        quoteVerified: true,
        quoteText: "The @billions_ntwk Public Sale is now live!\n\nHead over to the Capital Launchpad now to place your pledges.\n\nA reminder on the terms...\nShow more",
        likes: "2.1K",
        retweets: "674",
        replies: "834"
    },
    {
        id: 98,
        date: "Aug 6, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "AI agents are about to be everywhere.\n\nBut most of the time, we don't know who made them, who they work for, or what they'll do next.\n\nWith Billions DeepTrust framework, both humans and AI agents can prove who they are without sharing private information.",
        eventSummary: "DeepTrust Framework - AI agent identity",
        hasImage: true,
        hasVideo: false,
        likes: "2K",
        retweets: "565",
        replies: "677"
    },
    {
        id: 99,
        date: "Aug 7, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Don't miss the discussion today w/ @PauluzRFRM, where we'll dive into the future of @billions_ntwk and the role of AI in shaping the new internet\n\nWith our own:\n@0xAlexDigital (CMO)\n@ravikantagrawal (Director of Growth)\n@onchainron (Content & Brand)\n\nSet your reminder👇",
        eventSummary: "Pauluz RFRM Discussion - AI and the new internet",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Pauluz",
        quoteHandle: "@PauluzRFRM",
        quoteVerified: true,
        quoteText: "The wait is almost over.\n\nToday at 16:00 CET I'll be joined by the team from @billions_ntwk.\n\nExpect sharp questions, honest answers and the kind of insights you ...",
        likes: "2K",
        retweets: "565",
        replies: "677"
    },
    {
        id: 100,
        date: "Aug 7, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "With Billions, your personal data stays private.\n\nYou can prove you're human, without revealing your sensitive data.\n\nBuilt for privacy. Designed to scale.",
        eventSummary: "Privacy Message - Data stays private",
        hasImage: true,
        hasVideo: false,
        likes: "1.5K",
        retweets: "439",
        replies: "528"
    },
    {
        id: 101,
        date: "Aug 8, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions has reached 50% of the participation window in one day on @KaitoAI's Capital Launchpad!\n\nWe're just getting started 🔥",
        eventSummary: "50% Participation - Launchpad milestone",
        hasImage: true,
        hasVideo: false,
        likes: "1.3K",
        retweets: "397",
        replies: "634"
    },
    {
        id: 102,
        date: "Aug 8, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Digital identity is growing fast! From $30B+ in 2023 to $101B+ by 2030\n\nThe internet is shifting from anonymous traffic to verified interactions\n\nBillions is building the infrastructure and the interface to power it.",
        eventSummary: "Market Size - Identity market growth projection",
        hasImage: true,
        hasVideo: false,
        likes: "2.7K",
        retweets: "1.1K",
        replies: "1.8K"
    },
    {
        id: 103,
        date: "Aug 9, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions is built by community\n\nFrom your first feedback to your latest fire meme. Every follow, message, tag, and conversation has shaped this movement 👥\n\nWe're the largest human community on X!",
        eventSummary: "Community Built - Largest human community on X",
        hasImage: true,
        hasVideo: false,
        likes: "2.3K",
        retweets: "648",
        replies: "915"
    },
    {
        id: 104,
        date: "Aug 9, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Big update about Billions @KaitoAI launchpad!",
        eventSummary: "Launchpad Update - Terms updated based on feedback",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Kaito AI",
        quoteHandle: "@KaitoAI",
        quoteVerified: true,
        quoteText: ".@billions_ntwk have updated their terms based on community feedback!\n\n$100M valuation, 100% unlocked at TGE.\n\nShow more",
        likes: "1K",
        retweets: "319",
        replies: "385"
    },
    {
        id: 105,
        date: "Aug 9, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions + @KaitoAI state of mind🧘\n\n1\n2\n3 times hitting the top 1 on the Kaito Yapper Leaderboard this week 👥",
        eventSummary: "Kaito Leaderboard - Top 1 project 3 times",
        hasImage: true,
        hasVideo: false,
        likes: "957",
        retweets: "286",
        replies: "431"
    },
    {
        id: 106,
        date: "Aug 10, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions tech stack helps @HSBC speed up sign-ups & improve UX, by reusing verified KYC data across platforms, without sacrificing users's privacy.\n\n📡👇",
        eventSummary: "HSBC Partnership - Reusable KYC solution",
        hasImage: true,
        hasVideo: false,
        likes: "2.7K",
        retweets: "1.1K",
        replies: "1.1K"
    },
    {
        id: 107,
        date: "Aug 10, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "TGE is coming in the next few months.",
        eventSummary: "TGE Announcement - Token generation event coming",
        hasImage: true,
        hasVideo: false,
        likes: "6.1K",
        retweets: "1.7K",
        replies: "2K"
    },
    {
        id: 108,
        date: "Aug 10, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Fighting bots in Web3 starts with proving who's real human.\n\nBillions tech stack launched last year the first private biometric Proof of Humanity on @LineaBuild, in partnership w/ @VeraxRegistry\n\n📡👇",
        eventSummary: "Linea Proof of Humanity - Fighting bots with privacy",
        hasImage: true,
        hasVideo: false,
        likes: "1.4K",
        retweets: "432",
        replies: "424"
    },
    {
        id: 109,
        date: "Aug 10, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "+600K humans on X!\n\nThank you for making Billions the most creative and vibrant human community out here\n\n(Note: this video got outdated so quickly, we didn't even have time to update it for 600K 😂)",
        eventSummary: "600K Followers - Community celebration",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "We just hit 500K on X!\n\nThis wouldn't have been possible without you 🤝\n\nThe network is growing, and what's next will be more iconic.",
        likes: "1.5K",
        retweets: "429",
        replies: "508"
    },
    {
        id: 110,
        date: "Aug 11, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We've hit our participation target on @KaitoAI's Launchpad!\n\nBig thanks for helping us build the first universal Human and AI Network\n\nThe participation deadline has been extended to Aug 12, 3AM UTC.",
        eventSummary: "Participation Target Hit - Deadline extended",
        hasImage: true,
        hasVideo: false,
        likes: "1.2K",
        retweets: "473",
        replies: "481"
    },
    {
        id: 111,
        date: "Aug 11, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Today, Spaces with @billions_ntwk\n\nCome and meet the Billions team! 👇",
        eventSummary: "Meet the Team Spaces - Community call",
        hasImage: false,
        hasVideo: false,
        hasSpaces: true,
        spacesTitle: "Meet the BILLIONS team 🅱",
        spacesInfo: "3.6K tuned in · Aug 11 · 33:16",
        likes: "686",
        retweets: "239",
        replies: "327"
    },
    {
        id: 112,
        date: "Aug 11, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "TikTok is using Circom,\nthe most widely used ZK circuit framework, built by the team behind Billions.\n\nOur tech is ready for global-scale platforms.",
        eventSummary: "TikTok Uses Circom - Global scale validation",
        hasImage: true,
        hasVideo: false,
        likes: "829",
        retweets: "300",
        replies: "237"
    },
    {
        id: 113,
        date: "Aug 13, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The ZK library powering millions of users worldwide?\n\nBuilt by the team behind Billions\n\n100+ partners. 9,000+ apps\n\nThe go-to network for Human & AI verification.",
        eventSummary: "Billions Ecosystem - 100+ partners, 9000+ apps",
        hasImage: true,
        hasVideo: false,
        likes: "1.2K",
        retweets: "391",
        replies: "380"
    },
    {
        id: 114,
        date: "Aug 14, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions leaderboard on @KaitoAI has been updated ✅\n\nSmall yappers and creators who were previously out of the rankings are back in the game",
        eventSummary: "Leaderboard Updated - Small yappers back in game",
        hasImage: true,
        hasVideo: false,
        likes: "2.4K",
        retweets: "1.3K",
        replies: "1K"
    },
    {
        id: 115,
        date: "Aug 15, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Verified humans. Better data. Trusted AI\n\n@Billions_ntwk 🤝 @JoinSapien\n\nWe're joining forces to power Sapien's decentralized human intelligence with privacy-preserving identity and reputation.",
        eventSummary: "Sapien Partnership - Decentralized human intelligence",
        hasImage: true,
        hasVideo: false,
        likes: "2K",
        retweets: "773",
        replies: "593"
    },
    {
        id: 116,
        date: "Aug 15, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Joined Billions lately? 👀\n\nHere's your fast-track to what's been happening:",
        eventSummary: "Recap Thread - What's been happening",
        hasImage: false,
        hasVideo: true,
        hasQuote: true,
        quoteAuthor: "Ron",
        quoteHandle: "@onchainron",
        quoteVerified: true,
        quoteText: "it's been a wild and exciting few weeks around @billions_ntwk\n\nif you're just tuning in, here's the quick recap so you're in the loop:",
        likes: "787",
        retweets: "162",
        replies: "202"
    },
    {
        id: 117,
        date: "Aug 18, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "End-to-end fair token distribution\n\nEffortless to run, guaranteed to reach real human contributors:\n\n@billions_ntwk 🤝 @Clique2046",
        eventSummary: "Clique Partnership - Fair token distribution",
        hasImage: true,
        hasVideo: false,
        likes: "3.6K",
        retweets: "1.4K",
        replies: "2K"
    },
    {
        id: 118,
        date: "Aug 20, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Watch our Growth Director, @ravikantagrawal, on the judging panel at the HackX Buildathon by @athenax_co tomorrow 👇",
        eventSummary: "HackX Buildathon - Ravi as judge",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "AthenaX",
        quoteHandle: "@athenax_co",
        quoteVerified: true,
        quoteText: "Few people have seen more of Web3's growth and partnership playbook than @ravikantagrawal\nFrom Polygon Labs to @billions_ntwk, he's worked on connecting ecosystems worldwide, TGE and AI.\nProud to have him on the HackX judge panel...\nShow more",
        likes: "1K",
        retweets: "268",
        replies: "319"
    },
    {
        id: 119,
        date: "Aug 21, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Age checks are coming for the entire internet ✅\n\n@Wikipedia may soon be forced to verify every user's ID\n\nBillions' privacy-first Age Verification allows you prove you're 18+ without giving away your sensitive data.\n\n📡👇",
        eventSummary: "Age Verification - Wikipedia and internet-wide checks",
        hasImage: true,
        hasVideo: false,
        likes: "976",
        retweets: "262",
        replies: "264"
    },
    {
        id: 120,
        date: "Aug 22, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Humans + AI, verified ✅\n\nExcited to partner with @NexusLabs to power trust and authenticity in the AI era.\n\nReal human + A global supercomputer.\n\nAn internet where humans + AI connect with trust.",
        eventSummary: "Nexus Partnership - Trust in AI era",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Nexus",
        quoteHandle: "@NexusLabs",
        quoteVerified: true,
        quoteText: "AI is everywhere, but how do you know who's real?\n\nWith 1.5M+ verified users, @billions_ntwk is proving humanity at Internet scale.\n...",
        likes: "2.5K",
        retweets: "772",
        replies: "584"
    },
    {
        id: 121,
        date: "Aug 22, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Hey AI builders 👋\n\nBillions' Know Your Agent gives every AI agent a verifiable ID. Like a digital passport for agents 🤖\n\nTrust + Accountability + Compliance = The foundations of the agentic economy.",
        eventSummary: "Know Your Agent - Digital passport for AI agents",
        hasImage: false,
        hasVideo: true,
        likes: "1.2K",
        retweets: "340",
        replies: "332"
    },
    {
        id: 122,
        date: "Aug 23, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Your power, multiplied⚡\n\nFor 24h, every task you complete on the Billions portal = multiplied Power Points!\n\n1.5x, 1.8x, 2.0x... choose your fighter.\n\n👉 signup.billions.network",
        eventSummary: "Power Multiplier Event - 24h boost campaign",
        hasImage: true,
        hasVideo: false,
        likes: "1.7K",
        retweets: "554",
        replies: "582"
    },
    {
        id: 123,
        date: "Aug 24, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "New promo code: MULTIPLIER24H\n\nFirst 20,000 humans. 👥\n\nClaim code here: signup.billions.network",
        eventSummary: "Promo Code - MULTIPLIER24H for first 20K",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "Your power, multiplied⚡\n\nFor 24h, every task you complete on the Billions portal = multiplied Power Points!\n...",
        likes: "1.9K",
        retweets: "493",
        replies: "707"
    },
    {
        id: 124,
        date: "Aug 24, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Our mission is to save the internet in the age of AI\n\nBuilding the foundation for humans + AI agents to prove they're real, unique & accountable, is the first step to get there\n\nAppreciate @0xMarcB (CEO of @0xPolygon) recognising the work behind @billions_ntwk",
        eventSummary: "Mission Statement - Polygon CEO recognition",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Luc",
        quoteHandle: "@LucBerkefeld",
        quoteVerified: true,
        quoteText: "gBillions!\n\nProof of humanity is crucial in marketing.\n\nBeing able to identify real, unique individuals and rewarding them ...\nShow more",
        likes: "1K",
        retweets: "268",
        replies: "319"
    },
    {
        id: 125,
        date: "Aug 25, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Verified vibes only 👥\n\nBillions Yappers showed up this week with fire content, fresh takes, and good memes 👀\n\nHere are 10 superhuman contributions from this week👇",
        eventSummary: "Yappers Round - Top 10 community contributions",
        hasImage: true,
        hasVideo: false,
        likes: "1.9K",
        retweets: "452",
        replies: "512"
    },
    {
        id: 126,
        date: "Aug 26, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Age checks are spreading fast.\n\nNot just for adult content, but also across social media and gaming\n\n⚠️ The risk: Mass surveillance and giant data honeypots\n✅ The fix: Privacy-first verification\n\nOur CEO and Cofounder, Evin @provenauthority, told @TechRadar why the solution must be simple and private.",
        eventSummary: "Age Verification Spread - Privacy-first solution",
        hasImage: true,
        hasVideo: false,
        likes: "1.2K",
        retweets: "350",
        replies: "310"
    },
    {
        id: 127,
        date: "Aug 27, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Something fun is coming ⚽ B\n\nWe're joining forces with @footballdotfun for an upcoming spaces\n\nExpect football, NFTs & Billions vibes 👇",
        eventSummary: "Football Spaces - Upcoming collaboration",
        hasImage: false,
        hasVideo: false,
        hasSpaces: true,
        spacesTitle: "Details not available",
        spacesInfo: "",
        likes: "992",
        retweets: "276",
        replies: "410"
    },
    {
        id: 128,
        date: "Aug 27, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Identity + data, verified ✅\n\n@Billions_ntwk 🤝 @0xintuition\n\nLet's build the Human and AI Internet together.",
        eventSummary: "Intuition Partnership - Identity and data verified",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Intuition",
        quoteHandle: "@0xIntuition",
        quoteVerified: true,
        quoteText: "🚨 The future of AI trust is being built.\n\nWe're partnering with @billions_ntwk to bring identity + reputation to the age of agents. 👇",
        likes: "1.5K",
        retweets: "432",
        replies: "444"
    },
    {
        id: 129,
        date: "Aug 27, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Building the AI Agent Identity Stack\n\nHi @FlagshipFYI 🤝\n\n📡👇",
        eventSummary: "Flagship Partnership - AI agent identity stack",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "333",
        replies: "304"
    },
    {
        id: 130,
        date: "Aug 29, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "In the AI era, trust doesn’t come from content anymore. It comes from the source.\n\nBut how do we verify who’s real without compromising personal privacy?\n\nPrivate Proof of Uniqueness\n\n📡👇",
        eventSummary: "Private Proof of Uniqueness - Trust in AI era",
        hasImage: true,
        hasVideo: false,
        likes: "1.4K",
        retweets: "424",
        replies: "303"
    },
    {
        id: 131,
        date: "Aug 29, 2025",
        month: "August",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Building the trust layer for humans and AI.",
        eventSummary: "HackX Highlight - Ravi at opening ceremony",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "AthenaX",
        quoteHandle: "@athenax_co",
        quoteVerified: true,
        quoteText: "HackX Opening Ceremony Highlight\n@ravikantagrawal  from @billions_ntwk\n\nWeb3 builders, this one’s for you.\n...",
        likes: "711",
        retweets: "146",
        replies: "211"
    },
    {
        id: 132,
        date: "Sep 2, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Dear Billions Community and Partners,\n\nDue to the high demand and interest in the @OpenledgerHQ eligibility checker, users are currently unable to complete verification.\n\nWhat Happened?\nThe surge of requests has overloaded the capacity of our provider Allpass.ai, causing verification attempts to fail.\n\nImmediate Actions Taken:\nWe’re working closely with the AllPass team to restore normal verification flow as quickly as possible. Security and privacy remain intact.\n\nOur mission is to ensure only real human contributors can access eligibility.\n\nThank you for your patience,\nThe Billions team.",
        eventSummary: "Verification Issue - High demand overload notice",
        hasImage: false,
        hasVideo: false,
        likes: "2K",
        retweets: "452",
        replies: "694"
    },
    {
        id: 133,
        date: "Sep 2, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Preserving Human Creativity in the AI Era\n\nBillions + Camp are joining forces to make sure creators can still own, share and monetize their work, while proving they're real humans.\n\nHi @campnetworkxyz, let's build👍",
        eventSummary: "Camp Partnership - Preserving human creativity",
        hasImage: true,
        hasVideo: false,
        likes: "1.3K",
        retweets: "450",
        replies: "352"
    },
    {
        id: 134,
        date: "Sep 3, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions team is heading to Korean Blockchain Week 🇰🇷\n\nCatch us at Open AGI Summit on September 23rd!\n\nLet's build the first human + AI network together 👇",
        eventSummary: "Korean Blockchain Week - Open AGI Summit",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Open AGI Summit",
        quoteHandle: "@openagisummit",
        quoteVerified: true,
        quoteText: "As part of @kbwofficial, swing by this meetup where leading founders, investors, and builders will come together to explore the future of open source AI.\n\nCohosted by a mix of innovative projects across robotics, AI model ...\nShow more",
        likes: "993",
        retweets: "249",
        replies: "292"
    },
    {
        id: 135,
        date: "Sep 5, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "ZK alone won't save us. Why digital identity must stay plural.\n\n\"One ID per person sounds fair—until it becomes mandatory.\"\n\nFresh takes from Evin @provenauthority, Billions CEO & Cofounder, on @CryptoSlate 👇",
        eventSummary: "Plural Identity - CryptoSlate article",
        hasImage: true,
        hasVideo: false,
        likes: "1.4K",
        retweets: "423",
        replies: "435"
    },
    {
        id: 136,
        date: "Sep 5, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Today!\n\n@0xIntuition + @billions_ntwk 👇",
        eventSummary: "Intuition Live - Partnership announcement stream",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Intuition",
        quoteHandle: "@0xIntuition",
        quoteVerified: true,
        quoteText: "🚨 Friday Sep 5 @ 9:30AM ET we'll be live with @provenauthority & @ravikantagrawal from @billions_ntwk.\n\nGet ready to dive into the future of identity, reputation & the agentic economy as we explore the Intuition x Billions partnership!...",
        likes: "684",
        retweets: "105",
        replies: "177"
    },
    {
        id: 137,
        date: "Sep 5, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Supermasks by Billions 👥\n\nOur 2nd official NFT collection.\n\nEach Supermask proves you're real in a world where fakes dominate.\n\nWant to mint one for free?\n\nFollow, tag a friend and yap to earn a whitelist.",
        eventSummary: "Supermasks NFT - 2nd collection announcement",
        hasImage: true,
        hasVideo: false,
        likes: "11K",
        retweets: "5.6K",
        replies: "9.6K"
    },
    {
        id: 138,
        date: "Sep 7, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Open for NFT collabs!\n\nWant whitelist spots for the Billions Supermasks mint? Let's collab!\n\nIf your community is creating, vibing, or just real: we want you in.",
        eventSummary: "Supermasks Collab - NFT partnership opportunities",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "Supermasks by Billions 👥\n\nOur 2nd official NFT collection.\n\nEach Supermask proves you're real in a world where fakes dominate....",
        likes: "1.9K",
        retweets: "437",
        replies: "736"
    },
    {
        id: 139,
        date: "Sep 11, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Hey Web3 builders 👋\n\nTraditional KYC can kill onboarding.\n\nThat's why Billions is pioneering Progressive Identity Verification, a smarter way to verify users are real without hurting UX.",
        eventSummary: "Progressive KYC - Identity verification innovation",
        hasImage: false,
        hasVideo: true,
        likes: "1.9K",
        retweets: "582",
        replies: "478"
    },
    {
        id: 140,
        date: "Sep 14, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions community = Unstoppable 🔥\n\nWeek 3 of the Yappers Round and you all keep proving why humans creativity > bots\n\nHere are this week's shining top 10 👇",
        eventSummary: "Yappers Round Week 3 - Community creativity showcase",
        hasImage: true,
        hasVideo: false,
        likes: "3.2K",
        retweets: "1.3K",
        replies: "1.3K"
    },
    {
        id: 141,
        date: "Sep 16, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Every reward distributed = One verified human.\n\nRewards should go to real contributors. Not get drained by bots and duplicate wallets.\n\n@Billions_ntwk x @helios_layer1",
        eventSummary: "Helios Partnership - Proof of Humanity for fair rewards",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Helios | The ETF-Native Layer 1",
        quoteHandle: "@helios_layer1",
        quoteVerified: true,
        quoteText: "Helios x Billions Network: Proof of Humanity for a Fair Testnet ☀️\n\nWe've already taken big steps to limit bots on the Helios testnet leaderboard – because rewarding real ...",
        likes: "2.6K",
        retweets: "666",
        replies: "543"
    },
    {
        id: 142,
        date: "Sep 17, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "📣 Today — The First-ever Spaces with Billions + @SentientAGI Communities\n\n⏰ 5PM (CET)\n\nDetails below 👇",
        eventSummary: "Sentient AGI Spaces - First community collaboration",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "288",
        replies: "278"
    },
    {
        id: 143,
        date: "Sep 18, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Everything you need to know about the upcoming Billions Supermasks NFT 👥\n\n📅 Sept 18 • 6PM CET\n\nCo-host: @BigNillCollect from @0xPolygon\n\nSet your reminder 👇",
        eventSummary: "Supermasks NFT Info Session - Everything you need to know",
        hasImage: true,
        hasVideo: false,
        likes: "1.2K",
        retweets: "307",
        replies: "325"
    },
    {
        id: 144,
        date: "Sep 18, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Private Proof of Humanity for @Solana!\n\n@Billions_ntwk's first project on Solana is partnering with @BeamableNetwork, the DePIN network powering real games onchain.\n\n📱👇\n\nBuilt independently (plug-and-play). No personal data leaked.\n\nWhen builders have the right tools → magic happens 👇",
        eventSummary: "Beamable Partnership - Private Proof of Humanity on Solana",
        hasImage: true,
        hasVideo: false,
        likes: "2.8K",
        retweets: "846",
        replies: "365"
    },
    {
        id: 145,
        date: "Sep 19, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The Billions Team is on the ground at @kbwofficial 🇰🇷\n\nSeptember 22-28, Seoul\n\nIf you're a content creator, passionate builder, web3 lover, and dreamer ready to save the internet in the AI era, let's connect!\n\nDetails below 👇",
        eventSummary: "Korea Blockchain Week - Team on the ground in Seoul",
        hasImage: true,
        hasVideo: false,
        likes: "801",
        retweets: "205",
        replies: "228"
    },
    {
        id: 146,
        date: "Sep 19, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Want a guaranteed free mint of Supermasks NFT?\n\nBurn your Genesis NFT — and you'll get a Supermasks NFT 👥\n\n🔥 Burn deadline: Monday Sep 22, 23:59 CET",
        eventSummary: "Genesis Burn Event - Free Supermasks mint opportunity",
        hasImage: false,
        hasVideo: true,
        likes: "1.5K",
        retweets: "492",
        replies: "406"
    },
    {
        id: 147,
        date: "Sep 19, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Communities and creators: we're open for collabs on Supermasks NFT 👥\n\nQuick heads-up on what we'll need:\n\n→ Your socials\n→ Community X link\n→ Any special sauce you bring ✨\n\nFill out the form below or DM 👉 @HeyAverno\nforms.gle/uPPkRkzFt5sWMm...",
        eventSummary: "Supermasks Collab Form - Partnership application",
        hasImage: true,
        hasVideo: false,
        likes: "1K",
        retweets: "231",
        replies: "223"
    },
    {
        id: 148,
        date: "Sep 20, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Week 4 of the Yappers Round and you legends dropped masterpieces 🎨\n\nHere are this week's top 10 bangers 👇",
        eventSummary: "Yappers Round Week 4 - Top community content",
        hasImage: true,
        hasVideo: false,
        likes: "4.3K",
        retweets: "1.1K",
        replies: "370"
    },
    {
        id: 149,
        date: "Sep 22, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The second NFT drop from Billions is here\n\nBillions Supermasks",
        eventSummary: "Supermasks Launch Article - Official NFT drop announcement",
        hasImage: true,
        hasVideo: false,
        likes: "2.8K",
        retweets: "916",
        replies: "687"
    },
    {
        id: 150,
        date: "Sep 22, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "This Wednesday (Sep 24)\n\nAt #KBW 🇰🇷 our cofounder Evin @provenauthority will be speaking at \"The AI Creators Summit\"\n\nAlongside our friends at @campnetworkxyz and fellow builders pushing the space forward!\n\nDetails 👇",
        eventSummary: "AI Creators Summit - KBW speaking engagement",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Camp Network",
        quoteHandle: "@campnetworkxyz",
        quoteVerified: true,
        quoteText: "Welcome @provenauthority, Co-Founder of @billions_ntwk, at AI Creators Summit.\n\n🕐 24 September | 1-6 PM KST...",
        likes: "658",
        retweets: "98",
        replies: "208"
    },
    {
        id: 151,
        date: "Sep 23, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🔥 Burn extended – an extra 24h more!!\n\nNew deadline: Tuesday Sep 23, 23:59 CET\n\n300+ Genesis NFTs already burned 🔥\n\nWill you burn yours or hold it?",
        eventSummary: "Burn Extended - 24 hour extension for Genesis burn",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "Want a guaranteed free mint of Supermasks NFT?\n\nBurn your Genesis NFT — and you'll get a Supermasks NFT 👥\n\n🔥 Burn deadline: Monday Sep 22, 23:59 CET",
        likes: "1.1K",
        retweets: "273",
        replies: "282"
    },
    {
        id: 152,
        date: "Sep 23, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Our friends at @KRNL_xyz took our verification tech and created beautiful sybil resistance with offchain ZK verification and onchain action.\n\nBuilt independently (plug-and-play). No personal data leaked.\n\nWhen builders have the right tools → magic happens 👇",
        eventSummary: "KRNL Labs Partnership - Sybil resistance implementation",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "KRNL Labs",
        quoteHandle: "@KRNL_xyz",
        quoteVerified: true,
        quoteText: "You can now protect against sybil attacks without requiring users to give up personal data.\n\nAlongside @billions_ntwk, we've developed a POC any company can set up where users claim rewards after verification – without sharing ...",
        likes: "885",
        retweets: "231",
        replies: "223"
    },
    {
        id: 153,
        date: "Sep 25, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "ROAD TO AGENTIC FUTURE @ KBW 2025\n\nToday in Seoul, top builders and thinkers will share what's next for AI agents\n\n📍 Hyundai Card Understage, Itaewon\n🕐 13:30-18:30 KST\n👉 Register:",
        eventSummary: "Road to Agentic Future - KBW 2025 event",
        hasImage: true,
        hasVideo: false,
        likes: "826",
        retweets: "186",
        replies: "243"
    },
    {
        id: 154,
        date: "Sep 26, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "gBillions fam iconic 🅱️💙🇰🇷",
        eventSummary: "KBW Community Gathering - Iconic moments",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "evin",
        quoteHandle: "@provenauthority",
        quoteVerified: true,
        quoteText: ". @billions_ntwk is iconic at every table\n\nthanks to @IbagsuSubag 🅱️💙🇰🇷\n\n@baek_project @powitkorea @2_bp19 @PetiteSnowwww @0xCrocy ...",
        likes: "658",
        retweets: "98",
        replies: "208"
    },
    {
        id: 155,
        date: "Sep 26, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🌎 Big update! Laura Rodriguez @themiamiape is joining Billions to lead our marketing in LATAM/USA ✨\n\nShe's built communities and facilitated partnerships. Now she's driving our growth across the Americas.\n\nMeet her live in a Spaces soon! What do you want to know? Welcome her 🤗👏",
        eventSummary: "Laura Rodriguez Joins - LATAM/USA Marketing Lead",
        hasImage: true,
        hasVideo: false,
        likes: "699",
        retweets: "169",
        replies: "228"
    },
    {
        id: 156,
        date: "Sep 26, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Why Billions is both the OG of ZK and the new poster child of ZK Identity\n\nExplained by our CTO Oleksandr @OBrezhniev and our cofounder David @davidsrz at @zeroknowledgefm hosted by @AnnaRRose\n\nFull episode 🎙️\nzeroknowledge.fm/podcast/377/",
        eventSummary: "Zero Knowledge Podcast - The Evolution of Billions",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "292",
        replies: "295"
    },
    {
        id: 157,
        date: "Sep 28, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "This week's Yappers Round is all about Supermasks 👥\n\nHere are the top 10 hits👇",
        eventSummary: "Yappers Round Supermasks Edition - Top 10 content",
        hasImage: true,
        hasVideo: false,
        likes: "1.4K",
        retweets: "314",
        replies: "349"
    },
    {
        id: 158,
        date: "Sep 29, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Snapshot for Genesis burn and NFT holders was taken 📸✅",
        eventSummary: "Genesis Burn Snapshot - NFT holders recorded",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "🔥 Burn extended – an extra 24h more!!\n\nNew deadline: Tuesday Sep 23, 23:59 CET\n\n300+ Genesis NFTs already burned 🔥...",
        likes: "1.3K",
        retweets: "237",
        replies: "335"
    },
    {
        id: 159,
        date: "Sep 30, 2025",
        month: "September",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Bots and sybils draining your airdrop? Not on our watch 🚫\n\nBillions' Secure Token Distribution makes sure only real humans get rewarded — protecting your treasury & building real community trust.\n\nDM @ravikantagrawal for a demo 💪",
        eventSummary: "Secure Token Distribution - Anti-bot solution",
        hasImage: false,
        hasVideo: true,
        likes: "893",
        retweets: "209",
        replies: "264"
    },
    {
        id: 160,
        date: "Oct 1, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🌎 Billions Team is growing – welcome Lulu, Nacho, and Alex5!\n\nTogether, we're scaling trust across continents and disciplines.\n\nMeet the newest forces behind the Human & AI Network👇",
        eventSummary: "Team Expansion - New members join Billions",
        hasImage: true,
        hasVideo: false,
        likes: "847",
        retweets: "167",
        replies: "277"
    },
    {
        id: 161,
        date: "Oct 1, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The largest NFT marketplace wants to talk about Supermasks 👥\n\nTomorrow (Oct 2) 6pm CET / 12pm ET\n\n@opensea hosts - @0xPolygon co-hosts\n\nWe're revealing everything about the upcoming Billions Supermasks NFT drop!\n\nSet your reminder below 👇",
        eventSummary: "OpenSea Spaces - Supermasks reveal event",
        hasImage: true,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "OpenSea",
        quoteHandle: "@opensea",
        quoteVerified: true,
        quoteText: "Join us on Spaces this Thursday at 12pm ET with @billions_ntwk and @0xPolygon as we discuss how they're powering Supermasks NFTs.\n\nSet a reminder in the post below.",
        likes: "1.2K",
        retweets: "321",
        replies: "309"
    },
    {
        id: 162,
        date: "Oct 2, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Show us your superpower. Win a Supermasks NFT 👥\n\nRules:\n\n1. Reply with your content (any format)\n2. Show YOUR unique edge\n3. Ends Saturday, Oct 4th\n\nWe'll pick 5 winners to earn a Supermasks NFT. Are you one of them?\n\nReply below 👇",
        eventSummary: "Supermasks Contest - Show your superpower",
        hasImage: true,
        hasVideo: false,
        likes: "2K",
        retweets: "478",
        replies: "791"
    },
    {
        id: 163,
        date: "Oct 2, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Meet the team building Billions across continents.\n\n🎙️ Friday, Oct 3 | 6PM CET (12PM EST)\n\nCommunity growth. LATAM momentum. APAC expansion. Content strategy. The full vision behind the Human and AI Network.\n\nLive Q&A. First of many.\n\nSet reminder below 👇",
        eventSummary: "Team AMA - Global vision and strategy",
        hasImage: true,
        hasVideo: false,
        likes: "1.2K",
        retweets: "321",
        replies: "309"
    },
    {
        id: 164,
        date: "Oct 3, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "👥 Supermasks x @KaitoAI 🌊\n\nOur 2nd NFT collection drops Oct 6\n\nOne of the main utilities? Kaito leaderboard boost!\n\nAnd the Kaito community is getting rewarded with NFTs:\n– Top 500 Billions yappers (30d/90d)\n– Top 100 Yapybaras NFT holders\n– 100 random Yapybaras NFT holders",
        eventSummary: "Kaito Partnership - Supermasks utility announcement",
        hasImage: true,
        hasVideo: false,
        likes: "1.4K",
        retweets: "459",
        replies: "517"
    },
    {
        id: 165,
        date: "Oct 3, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Saving the Internet in the AI Era 👥\n\nOur cofounder David Z. @davidsrz broke down Billions' 3-phase vision at @zeroknowledgefm",
        eventSummary: "3-Phase Vision - Saving the Internet in AI Era",
        hasImage: false,
        hasVideo: true,
        likes: "719",
        retweets: "127",
        replies: "180"
    },
    {
        id: 166,
        date: "Oct 3, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Your identity online shouldn't be rumors.\n\nBillions CEO & Co-founder Evin @provenauthority breaks down why the atomic unit of blockchains is the human. And how Billions makes it private, mobile-first, and globally scalable.",
        eventSummary: "idOS Interview - Identity shouldn't be rumors",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "idOS",
        quoteHandle: "@idOS_network",
        quoteVerified: true,
        quoteText: "\"Today, in much of digital space, your identity is a series of rumors that parties you don't know are spreading behind your back\"\n\nTrue web3 identity OG @provenauthority, Co-Founder & CEO of @billions_ntwk, is our newest guest!...",
        likes: "660",
        retweets: "130",
        replies: "178"
    },
    {
        id: 167,
        date: "Oct 3, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🌎 Big update! @jgonzalezferrer has been promoted to Head of Community\n\nMeet him live in a Spaces today! What do you want to know? Welcome him 🤗👏",
        eventSummary: "Javi Promoted - Head of Community announcement",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Javi🌊.eth",
        quoteHandle: "@jgonzalezferrer",
        quoteVerified: true,
        quoteText: "Proud to announce I've been promoted to Head of Community at @billions_ntwk 😍😍😍\n\nThanks to the whole community for the support. I couldn't have done it without you 💙...",
        likes: "750",
        retweets: "118",
        replies: "285"
    },
    {
        id: 168,
        date: "Oct 3, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🚨 Last chance before the Supermasks NFT mint.\n\nWe're giving away 5 WL spots!\n\nHow to join:\n– Follow @billions_ntwk\n– Tag a friend\n\nGood luck, Superhumans 👥",
        eventSummary: "Supermasks WL Giveaway - Last chance before mint",
        hasImage: true,
        hasVideo: false,
        likes: "7.7K",
        retweets: "3.4K",
        replies: "6K"
    },
    {
        id: 169,
        date: "Oct 4, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "You × 2,000,000 = 💙\n\nIn this universe, you are the gBillionth star 💫\n\nNext stop: 3M!",
        eventSummary: "2 Million Milestone - Community celebration",
        hasImage: false,
        hasVideo: true,
        likes: "1.6K",
        retweets: "342",
        replies: "344"
    },
    {
        id: 170,
        date: "Oct 4, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "💎 TRUST $0.00051616 📈\n\nHumans verified = Rewards unlocked!\n\n2,000 Billions Genesis NFT holders are in the @0xIntuition $TRUST Airdrop!\n\nCelebrating communities that keep Web3 real.\n\nCheck if you made it 👇",
        eventSummary: "Intuition TRUST Airdrop - Genesis holders rewarded",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Intuition",
        quoteHandle: "@0xIntuition",
        quoteVerified: true,
        quoteText: "For those who can be TRUSTed.\n\nRegistration begins now: medium.com/0xintuition/in...\n\nOpen until October 14th 2025, at 23:59 EST. ...",
        likes: "1.5K",
        retweets: "368",
        replies: "342"
    },
    {
        id: 171,
        date: "Oct 4, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Mask up, Superhumans 👥\n\nThe Supermasks NFT mint starts next Monday.\n\n📅 Oct 6, 13:00 UTC\n📍 @OpenSea\n🟣 @0xPolygon",
        eventSummary: "Supermasks Mint Date - October 6 announcement",
        hasImage: true,
        hasVideo: false,
        likes: "1.3K",
        retweets: "368",
        replies: "342"
    },
    {
        id: 172,
        date: "Oct 6, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "WL checker for Supermasks is LIVE!\n\nWant to know if you made it?\n\n🔍 Check your eligibility now: opensea.io/collection/bil...\n\n📅 Mint goes live Oct 6, 13:00 UTC",
        eventSummary: "Supermasks WL Checker - Eligibility check live",
        hasImage: true,
        hasVideo: false,
        likes: "1.5K",
        retweets: "470",
        replies: "519"
    },
    {
        id: 173,
        date: "Oct 6, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Supermasks Mint is LIVE! 👥\n\nMint yours now 👇\nopensea.io/collection/bil...\n\nThank you @0xPolygon x @OpenSea",
        eventSummary: "Supermasks Mint LIVE - Official launch",
        hasImage: false,
        hasVideo: true,
        likes: "2K",
        retweets: "618",
        replies: "525"
    },
    {
        id: 174,
        date: "Oct 7, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "🚨 Public phase is LIVE!\n\nIf you missed the first rounds, this is your shot to mint your Supermask NFT.\n\nGo claim your identity superpower 👥",
        eventSummary: "Supermasks Public Mint - Final opportunity",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "Supermasks Mint is LIVE! 👥\n\nMint yours now 👇\nopensea.io/collection/bil...",
        likes: "853",
        retweets: "288",
        replies: "235"
    },
    {
        id: 175,
        date: "Oct 7, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We'll have @Carlitoswa_y and @Beijingdou on the mic in a few hours – hosted by our @TheMiamiApe\n\nToday 🕐 17:00 CET (11:00 ET)\n\n🔔 Set reminder 👇 (if you haven't already)",
        eventSummary: "Web3 Building & Rewards - Community Spaces",
        hasImage: true,
        hasVideo: false,
        likes: "602",
        retweets: "122",
        replies: "192"
    },
    {
        id: 176,
        date: "Oct 8, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Supermasks NFT sale finished! 👥\n\nWelcome to all the new @billions_ntwk Supermasks holders 🥳\n\nA total of 5757 Supermasks NFTs have been minted\n\nReveal? This week 👀",
        eventSummary: "Supermasks Sale Complete - 5757 minted",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "Supermasks Mint is LIVE! 👥\n\nMint yours now 👇\nopensea.io/collection/bil...",
        likes: "852",
        retweets: "220",
        replies: "347"
    },
    {
        id: 177,
        date: "Oct 8, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Big news from @Deloitte:\n\nTheir $4T semi-liquid funds report names Billions' tech stack @privadoID as the solution for privacy-preserving KYC in tokenized finance.\n\nTradFi is waking up to ZK. Are you ready?",
        eventSummary: "Deloitte Report - Billions featured for TradFi KYC",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "295",
        replies: "293"
    },
    {
        id: 178,
        date: "Oct 9, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Tomorrow, the Billions Supermasks are born 👥\n\nIt's REVEAL DAY.\n\nTime to unlock your new superpower 👇",
        eventSummary: "Supermasks Reveal Announcement - Tomorrow is the day",
        hasImage: false,
        hasVideo: false,
        hasSpaces: true,
        spacesTitle: "Reveal: Supermasks NFT 👥 🅱",
        spacesInfo: "2.6K tuned in · Oct 10 · 1:08:22",
        likes: "1.2K",
        retweets: "363",
        replies: "414"
    },
    {
        id: 179,
        date: "Oct 11, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Supermasks NFT REVEALED 👥🅱️\n\nMissed the reveal? No problem, recording below 👇",
        eventSummary: "Supermasks NFT Revealed - Recording available",
        hasImage: false,
        hasVideo: true,
        likes: "866",
        retweets: "178",
        replies: "196"
    },
    {
        id: 180,
        date: "Oct 13, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We're excited to have our Billions CEO Evin McMullen @provenauthority and @BoredElonMusk on the show!\n\nJoin us tomorrow to talk about Identity & Reputation\n\n📅 Oct 14 | 🕐 18:30 CET / 12:30 ET / 09:30 PT\n\n🔔 Set reminder 👇",
        eventSummary: "Identity & Reputation Show - CEO Evin McMullen",
        hasImage: true,
        hasVideo: false,
        likes: "916",
        retweets: "214",
        replies: "242"
    },
    {
        id: 181,
        date: "Oct 15, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Can you really trust AI agents?\n\nOur CEO Evin McMullen @provenauthority knows 📜\n\nThe Deep Trust Framework is all about trusting someone",
        eventSummary: "Deep Trust Framework - Trusting AI agents",
        hasImage: false,
        hasVideo: true,
        hasQuote: true,
        quoteAuthor: "Billions",
        quoteHandle: "@billions_ntwk",
        quoteVerified: true,
        quoteText: "We're excited to have our Billions CEO Evin McMullen @provenauthority and @BoredElonMusk on the show!...",
        likes: "719",
        retweets: "127",
        replies: "180"
    },
    {
        id: 182,
        date: "Oct 17, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The future doesn't trust blindly. It verifies.\n\nToday @ 14:30 UTC, our @ravikantagrawal joins Agent Builder Talks to show you:\n\nHow verified agents are reshaping what's possible when humans and AI actually trust each other\n\n✅ Verified Agents\n✅ DIDs\n✅ The Network Effect of Trust\n\nNo hype. Just infrastructure for the inevitable.\n\n→ Join us live on @hellomother_ai 🤖🌎",
        eventSummary: "Agent Builder Talks - Verified agents and trust",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Mother (🤖,🌎)",
        quoteHandle: "@hellomother_ai",
        quoteVerified: true,
        quoteText: "Join us here tomorrow, Oct 17 @ 14:30 UTC for Agent Builder Talks with @ravikantagrawal AI & Web3 BD head at @billions_ntwk\n\nHosted by @francescoswiss and @jamesyoung. We'll be discussing:...",
        likes: "660",
        retweets: "130",
        replies: "178"
    },
    {
        id: 183,
        date: "Oct 17, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We're honored that Billions Network and @privadoID just got featured in the @web3privacy market report.\n\nZero-knowledge-based identity solutions?\n\nWe're on the list.\n\nPrivacy isn't optional when saving the internet in the age AI.\n\nFull report 👇",
        eventSummary: "Web3Privacy Report - Billions featured",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Web3Privacy Now",
        quoteHandle: "@web3privacy",
        quoteVerified: true,
        quoteText: "Welcome Web3 Privacy market midyear report!\n\nFeaturing key data related to market\n– product updates\n– protocol launches...",
        likes: "948",
        retweets: "338",
        replies: "312"
    },
    {
        id: 184,
        date: "Oct 17, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We're back with one of our favorite things to do on a Friday...\n\nMaking you shine like a gBillion 😁🅱️\n\nHere's Yappers Round Week 6\n\nThese 10 tweets took our breath away 👇",
        eventSummary: "Yappers Round Week 6 - Top community content",
        hasImage: true,
        hasVideo: false,
        likes: "925",
        retweets: "164",
        replies: "214"
    },
    {
        id: 185,
        date: "Oct 18, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Less dystopian\nMore cypherpunk\n\nThe philosophy that created Bitcoin and inspired Web3\n\nNow continued in the age of AI where...\n\nBillions protects people from surveillance, whether by governments or corporations\n\nBecause...\n\nSelf-sovereign identity isn't something you should have to beg for – it should be built into the systems we use every day.\n\n📜 Our CEO Evin McMullen @provenauthority in @Cointelegraph's feature on why crypto needs proof of personhood that doesn't sacrifice your sovereignty 👇",
        eventSummary: "Cointelegraph Feature - Cypherpunk philosophy",
        hasImage: true,
        hasVideo: false,
        likes: "1.1K",
        retweets: "295",
        replies: "293"
    },
    {
        id: 186,
        date: "Oct 19, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Join our Laura @TheMiamiApe when she'll have a full house of 3 guests:\n\n@Pons_ETH\n@xeetdotai\n@tolibear_\n\nTalking about the BIG TOPICS:\n\n1. Attention\n2. Trust\n3. Information Discovery in Web3\n\nJoin us on Tuesday:\n\n📅 Oct 21\n⏰ 17:00 CET / 11:00 ET / 08:00 PT\n\n🔔 Set reminder 👇",
        eventSummary: "Attention Trust Discovery - Tuesday Spaces",
        hasImage: true,
        hasVideo: false,
        likes: "602",
        retweets: "122",
        replies: "192"
    },
    {
        id: 187,
        date: "Oct 21, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Billions × @WardenProtocol are joining forces to build the future of trust between humans and AI\n\nStart by joining our first campaign and claim your \"Billions 🤝 Warden\" role on Warden Discord!\n\nThis role unites both communities (Humans, AIs, and Agents) to kickoff a week of collabs, raffles and onchain fun\n\nQuests are LIVE on Galxe! 👇\n\napp.galxe.com/quest/WardenPr...",
        eventSummary: "Warden Protocol Partnership - Quest campaign live",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Warden",
        quoteHandle: "@wardenprotocol",
        quoteVerified: true,
        quoteText: "Warden x @billions_ntwk are teaming up to shape the future of trust between humans and AI\n\nJump into our first campaign and claim your \"Billions 🤝 Warden\" role on the Warden Discord!...",
        likes: "1.2K",
        retweets: "321",
        replies: "309"
    },
    {
        id: 188,
        date: "Oct 22, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Privacy or compliance?\n\nYou shouldn't have to choose\n\n@billions_ntwk × @useTria are setting a new standard for onchain identity.\n\nWelcome to zkKYC where you verify who you are without exposing who you are",
        eventSummary: "Tria Partnership - zkKYC announcement",
        hasImage: true,
        hasVideo: false,
        likes: "948",
        retweets: "338",
        replies: "312"
    },
    {
        id: 189,
        date: "Oct 22, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "\"To save the internet in the age of AI, we need to be able to verify who we are and who we're interacting with in digital space,\" says our CEO Evin McMullen @provenauthority\n\nExactly how we're saving the internet in the age of AI, Evin is going to explain in this wonderful interview👇",
        eventSummary: "CCN Interview - Saving the internet in AI age",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "CCN",
        quoteHandle: "@CCNDotComNews",
        quoteVerified: true,
        quoteText: "The digital era demands higher standards for privacy and identity, especially with #AI agents and #stablecoins headed our way. 🤖🔍\n\nJoin @Eddie__0 and Evin McMullen (@provenauthority), founder of @PrivadoID and @billions_ntwk, to discover what's next for Web3. 🌐",
        likes: "346",
        retweets: "68",
        replies: "90"
    },
    {
        id: 190,
        date: "Oct 23, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The post-KBW vibes continue!\n\nJoin us for a spooky networking night at an arcade pub in Hongdae:\n\nRSVP → luma.com/ns2e7nst\n\n✅ costume required (or wear something orange 🟠)\n✅ drinks flowing\n✅ great vibes, fun time\n✅ and zero formal agenda!\n\nJust good people, great conversations, and a prize for best costume 🎭\n\nOct 29 (Wed) • 7-11 PM\n\n@SentientAGI @KaitoAI",
        eventSummary: "Halloween Community Night - Hongdae networking",
        hasImage: true,
        hasVideo: false,
        likes: "602",
        retweets: "122",
        replies: "192"
    },
    {
        id: 191,
        date: "Oct 23, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "The \"Billions 🤝 Warden\" raffles to come\n\nRaffle prizes include:\n\n👥 5 Billions Supermasks NFTs\n🛡️ 50 Warden OG (Protector) roles\n🪙 1 Million PUMPs\n🔷 5 Warden Basic Sub NFTs\n\nRegister and explore the Warden App to experience the next evolution of blockchain Agents\n\nYour role = your access to future cross-community quests and rewards\n\nJoin now 👇\napp.galxe.com/quest/WardenPr...",
        eventSummary: "Warden Raffles - Cross-community rewards",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Warden",
        quoteHandle: "@wardenprotocol",
        quoteVerified: true,
        quoteText: "The \"Billions 🤝 Warden\" raffles to come.\n\nRaffle prizes include:\n👥 Billions Supermasks NFTs\n🛡️ Warden OG (Protector) roles...",
        likes: "1.2K",
        retweets: "321",
        replies: "309"
    },
    {
        id: 192,
        date: "Oct 23, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Meet the new Billions Interns Team 👥\n\n@Seymirel\n@Caben_nft\n@Lunaticanto\n@MartinKoong\n@monitalan\n\nThese amazing people show perfectly what Billions is all about: growth, talent, and trust.\n\nKeep reading to discover their stories 👇📜",
        eventSummary: "Interns Team Welcome - New talent joins Billions",
        hasImage: true,
        hasVideo: false,
        likes: "736",
        retweets: "160",
        replies: "353"
    },
    {
        id: 193,
        date: "Oct 24, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Next week is going to be the start of sth big !!!",
        eventSummary: "Big Announcement Teaser - Something big coming",
        hasImage: false,
        hasVideo: false,
        hasQuote: true,
        quoteAuthor: "Ron",
        quoteHandle: "@onchainron",
        quoteVerified: true,
        quoteText: "just wanna say:\nnext week.\n\nturn on your 🔔 @billions_ntwk",
        likes: "298",
        retweets: "48",
        replies: "146"
    },

    {
        id: 194,
        date: "Oct 25, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "We love human creativity — and we love spreading the word.\nSo please enjoy this week’s Billions Yappers Round👇",
        eventSummary: "Another Yapeers round",
        hasImage: true,
        hasVideo: false,
        likes: "710",
        retweets: "141",
        replies: "222"
    },

    {
        id: 195,
        date: "Oct 25, 2025",
        month: "October",
        author: "Billions",
        handle: "@billions_ntwk",
        verified: true,
        text: "Who is our CEO Evin McMullen @provenauthority?\nLet’s find out 👇",
        eventSummary: "CEO talk - Evin McMullen",
        hasImage: false,
        hasVideo: true,
        hasMultipleMedia: true,
        mediaList: [
            { type: 'video', id: '195' },
            { type: 'video', id: '195(1)' },
            { type: 'video', id: '195(2)' }
        ],
        likes: "123",
        retweets: "24",
        replies: "65"
    }
];

// Application State
let state = {
    started: false,
    currentIndex: 0,
    isAnimating: false,
    showMedia: false,
    textProgress: 0,
    slideOut: false,
    autoMode: false,
    isMuted: false,
    videoPaused: false,
    currentMediaIndex: 0
};

// DOM Elements
let elements = {};

// Timers
let typingTimer = null;
let mediaTimer = null;
let autoTimer = null;
let waveTimer = null;

// Initialize application
function init() {
    // Cache DOM elements
    elements = {
        startScreen: document.getElementById('startScreen'),
        timelineContainer: document.getElementById('timelineScreen'),
        tweetCard: document.getElementById('tweetCard'),
        tweetAuthor: document.getElementById('tweetAuthor'),
        tweetHandle: document.getElementById('tweetHandle'),
        tweetDate: document.getElementById('tweetDate'),
        tweetText: document.getElementById('tweetText'),
        tweetLikes: document.getElementById('tweetLikes'),
        tweetRetweets: document.getElementById('tweetRetweets'),
        tweetReplies: document.getElementById('tweetReplies'),
        smallImagePreview: document.getElementById('smallImagePreview'),
        smallVideoPreview: document.getElementById('smallVideoPreview'),
        mediaOverlay: document.getElementById('mediaOverlay'),
        mediaImage: document.getElementById('mediaImage'),
        mediaVideo: document.getElementById('mediaVideo'),
        sideImageDisplay: document.getElementById('sideImageDisplay'),
        sideImage: document.getElementById('sideImage'),
        sideImage2: document.getElementById('sideImage2'),
        eventSummary: document.getElementById('eventSummary'),
        eventSummaryText: document.getElementById('eventSummaryText'),
        progressBar: document.getElementById('progressBar'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        prevBtn: document.getElementById('prevButton'),
        nextBtn: document.getElementById('nextButton'),
        autoBtn: document.getElementById('autoButton'),
        muteBtn: document.getElementById('muteButton'),
        playPauseBtn: document.getElementById('playPauseBtn'),
        bgMusic: document.getElementById('bgMusic'),
        whooshSound: document.getElementById('whooshSound'),
        quoteContainer: document.getElementById('quoteTweet'),
        quoteAuthor: document.getElementById('quoteAuthor'),
        quoteHandle: document.getElementById('quoteHandle'),
        quoteText: document.getElementById('quoteText'),
        spacesEmbed: document.getElementById('spacesEmbed'),
        spacesTitle: document.getElementById('spacesTitle'),
        spacesInfo: document.getElementById('spacesInfo'),
        articleEmbed: document.getElementById('articleEmbed'),
        articleImage: document.getElementById('articleImage'),
        articleTitle: document.getElementById('articleTitle'),
        articleDescription: document.getElementById('articleDescription'),
        prevMediaButton: null, // Will be created dynamically
        nextMediaButton: null // Will be created dynamically
    };
    
    // Event listeners
    document.getElementById('startButton').addEventListener('click', startTimeline);
    elements.prevBtn.addEventListener('click', handlePrevious);
    elements.nextBtn.addEventListener('click', handleNext);
    elements.autoBtn.addEventListener('click', toggleAutoMode);
    elements.muteBtn.addEventListener('click', toggleMute);
    elements.playPauseBtn.addEventListener('click', toggleVideoPlayback);
    elements.smallImagePreview.addEventListener('click', showFullMedia);
    elements.smallVideoPreview.addEventListener('click', showFullMedia);
    elements.mediaVideo.addEventListener('ended', handleVideoEnd);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (!state.started) return;
        
        if (e.key === 'ArrowLeft') handlePrevious();
        else if (e.key === 'ArrowRight') handleNext();
        else if (e.key === ' ') {
            e.preventDefault();
            if (state.showMedia && elements.mediaVideo.src) {
                toggleVideoPlayback();
            }
        }
    });
}

// Start timeline
function startTimeline() {
    state.started = true;
    elements.startScreen.classList.add('hidden');
    elements.timelineContainer.classList.remove('hidden');
    createDotTimeline();
    updateMonthDisplay();
    playBackgroundMusic();
    updateUI();
    startWaveAnimation();
    
    // Ensure Billions profile picture is visible
    ensureProfilePictureVisible();
    
    // Start initial media preloading
    mediaPreloader.preloadMedia(timelineData, state.currentIndex);
}

// Update UI
function updateUI() {
    const tweet = timelineData[state.currentIndex];
    
    // Update tweet content
    elements.tweetAuthor.textContent = tweet.author;
    elements.tweetHandle.textContent = tweet.handle;
    elements.tweetDate.textContent = tweet.date;
    elements.tweetLikes.textContent = tweet.likes;
    elements.tweetRetweets.textContent = tweet.retweets;
    elements.tweetReplies.textContent = tweet.replies;
    
    // Update profile picture to ensure it's visible for each tweet
    const avatarImg = document.querySelector('.avatar img');
    if (avatarImg) {
        // Force refresh the profile picture
        avatarImg.src = 'logo.jpg';
        avatarImg.style.display = 'block';
        avatarImg.style.opacity = '1';
        avatarImg.style.width = '100%';
        avatarImg.style.height = '100%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.style.borderRadius = '50%';
        
        // Ensure it loads properly
        setTimeout(() => {
            if (avatarImg.src.includes('logo.jpg')) {
                avatarImg.style.opacity = '1';
                console.log('Profile picture confirmed visible for tweet', tweet.id);
            }
        }, 100);
        
        console.log('Profile picture refreshed for tweet', tweet.id);
    }
    
    // Update event summary
    if (elements.eventSummaryText) {
        elements.eventSummaryText.textContent = tweet.eventSummary;
    }
    
    // Update progress
    const progress = ((state.currentIndex + 1) / timelineData.length) * 100;
    elements.progressFill.style.width = `${progress}%`;
    if (elements.progressText) {
        elements.progressText.textContent = `${state.currentIndex + 1} / ${timelineData.length}`;
    }
    
    // Update verified icon
    const verifiedIcon = document.getElementById('verifiedIcon');
    if (verifiedIcon) {
        verifiedIcon.style.display = tweet.verified ? 'block' : 'none';
    }
    
    // Update buttons
    elements.prevBtn.disabled = state.currentIndex === 0;
    // Keep next button enabled to show final message
    elements.nextBtn.disabled = false;
    
    // Ensure Billions profile picture is visible
    ensureProfilePictureVisible();
    
    // Handle quote tweets - NO EMBEDDED MEDIA, just show quote
    if (tweet.hasQuote) {
        elements.quoteContainer.classList.remove('hidden');
        elements.quoteAuthor.textContent = tweet.quoteAuthor;
        elements.quoteHandle.textContent = tweet.quoteHandle;
        elements.quoteText.textContent = tweet.quoteText;
    } else {
        elements.quoteContainer.classList.add('hidden');
    }
    
    // Hide all embedded media previews - media shows on RIGHT side only
    elements.smallImagePreview.classList.add('hidden');
    elements.smallVideoPreview.classList.add('hidden');
    
    // Handle X Spaces embed
    if (tweet.hasSpaces) {
        elements.spacesEmbed.classList.remove('hidden');
        elements.spacesTitle.textContent = tweet.spacesTitle;
        elements.spacesInfo.textContent = tweet.spacesInfo;
    } else {
        elements.spacesEmbed.classList.add('hidden');
    }
    
    // Handle Article embed
    if (tweet.hasArticle) {
        elements.articleEmbed.classList.remove('hidden');
        elements.articleImage.src = tweet.articleImage;
        elements.articleTitle.textContent = tweet.articleTitle;
        elements.articleDescription.textContent = tweet.articleDescription;
    } else {
        elements.articleEmbed.classList.add('hidden');
    }
    
    // Handle multiple media
    if (tweet.hasMultipleMedia && tweet.mediaList) {
        // Create buttons if not exist
        if (!elements.prevMediaButton) {
            elements.prevMediaButton = document.createElement('button');
            elements.prevMediaButton.id = 'prevMediaButton';
            elements.prevMediaButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back';
            elements.prevMediaButton.style.position = 'absolute';
            elements.prevMediaButton.style.bottom = '20px';
            elements.prevMediaButton.style.left = '20px';
            elements.prevMediaButton.style.background = 'rgba(0,0,0,0.7)';
            elements.prevMediaButton.style.color = 'white';
            elements.prevMediaButton.style.border = 'none';
            elements.prevMediaButton.style.padding = '10px 15px';
            elements.prevMediaButton.style.borderRadius = '5px';
            elements.prevMediaButton.style.cursor = 'pointer';
            elements.prevMediaButton.style.zIndex = '1000';
            elements.prevMediaButton.addEventListener('click', prevMedia);
            elements.mediaOverlay.appendChild(elements.prevMediaButton);
        }
        if (!elements.nextMediaButton) {
            elements.nextMediaButton = document.createElement('button');
            elements.nextMediaButton.id = 'nextMediaButton';
            elements.nextMediaButton.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
            elements.nextMediaButton.style.position = 'absolute';
            elements.nextMediaButton.style.bottom = '20px';
            elements.nextMediaButton.style.right = '20px';
            elements.nextMediaButton.style.background = 'rgba(0,0,0,0.7)';
            elements.nextMediaButton.style.color = 'white';
            elements.nextMediaButton.style.border = 'none';
            elements.nextMediaButton.style.padding = '10px 15px';
            elements.nextMediaButton.style.borderRadius = '5px';
            elements.nextMediaButton.style.cursor = 'pointer';
            elements.nextMediaButton.style.zIndex = '1000';
            elements.nextMediaButton.addEventListener('click', nextMedia);
            elements.mediaOverlay.appendChild(elements.nextMediaButton);
        }
        elements.prevMediaButton.style.display = 'block';
        elements.nextMediaButton.style.display = 'block';
        // Load first media as before
    } else {
        // Hide buttons if exist
        if (elements.prevMediaButton) {
            elements.prevMediaButton.style.display = 'none';
        }
        if (elements.nextMediaButton) {
            elements.nextMediaButton.style.display = 'none';
        }
    }
    
    // Pre-load media but keep hidden until typing completes
    if (tweet.hasMultipleMedia) {
        const firstMedia = tweet.mediaList[0];
        if (firstMedia.type === 'image') {
            // Hide second image by default
            elements.sideImage2.classList.add('hidden');
            
            // Show loading placeholder
            showImageLoading();
            
            // Try to get cached media first
            const cachedImage = mediaPreloader.getCachedImage(firstMedia.id);
            if (cachedImage) {
                // Use cached image immediately
                hideImageLoading();
                if (cachedImage.type === 'multi') {
                    elements.sideImage.src = cachedImage.paths[0];
                    elements.sideImage2.src = cachedImage.paths[1];
                    elements.sideImage2.classList.remove('hidden');
                    elements.sideImage.style.height = 'auto';
                    
                    const sideImageContent = document.getElementById('sideImageContent');
                    if (sideImageContent) {
                        sideImageContent.classList.remove('horizontal', 'vertical', 'square');
                        sideImageContent.classList.add('multi-part');
                    }
                } else {
                    elements.sideImage.src = cachedImage.path;
                    elements.sideImage.style.height = '100%';
                    elements.sideImage2.classList.add('hidden');
                    
                    // Detect aspect ratio and apply appropriate class
                    const aspectRatio = cachedImage.image.width / cachedImage.image.height;
                    const sideImageContent = document.getElementById('sideImageContent');
                    if (sideImageContent) {
                        sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                        if (aspectRatio > 1.3) {
                            sideImageContent.classList.add('horizontal');
                        } else if (aspectRatio < 0.8) {
                            sideImageContent.classList.add('vertical');
                        } else {
                            sideImageContent.classList.add('square');
                        }
                    }
                }
                
                // Reset to hidden state
                elements.sideImageDisplay.classList.add('hidden');
                elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
            } else {
                // Try force loading first, then fallback to original method
                mediaPreloader.forceLoadMedia(firstMedia.id, 'image').then((cachedResult) => {
                    if (cachedResult && cachedResult !== 'placeholder') {
                        hideImageLoading();
                        // Use the force-loaded cached result
                        if (cachedResult.type === 'multi') {
                            elements.sideImage.src = cachedResult.paths[0];
                            elements.sideImage2.src = cachedResult.paths[1];
                            elements.sideImage2.classList.remove('hidden');
                            elements.sideImage.style.height = 'auto';
                            
                            const sideImageContent = document.getElementById('sideImageContent');
                            if (sideImageContent) {
                                sideImageContent.classList.remove('horizontal', 'vertical', 'square');
                                sideImageContent.classList.add('multi-part');
                            }
                        } else {
                            elements.sideImage.src = cachedResult.path;
                            elements.sideImage.style.height = '100%';
                            elements.sideImage2.classList.add('hidden');
                            
                            // Detect aspect ratio and apply appropriate class
                            const aspectRatio = cachedResult.image.width / cachedResult.image.height;
                            const sideImageContent = document.getElementById('sideImageContent');
                            if (sideImageContent) {
                                sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                                if (aspectRatio > 1.3) {
                                    sideImageContent.classList.add('horizontal');
                                } else if (aspectRatio < 0.8) {
                                    sideImageContent.classList.add('vertical');
                                } else {
                                    sideImageContent.classList.add('square');
                                }
                            }
                        }
                        
                        // Reset to hidden state
                        elements.sideImageDisplay.classList.add('hidden');
                        elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
                    } else {
                        // Fallback to original loading method
                        tryLoadImage(firstMedia.id, (result) => {
                            hideImageLoading();
                            if (result !== 'placeholder') {
                                if (result.type === 'multi') {
                                    // Multi-part image
                                    elements.sideImage.src = result.paths[0];
                                    elements.sideImage2.src = result.paths[1];
                                    elements.sideImage2.classList.remove('hidden');
                                    elements.sideImage.style.height = 'auto';
                                    
                                    const sideImageContent = document.getElementById('sideImageContent');
                                    if (sideImageContent) {
                                        sideImageContent.classList.remove('horizontal', 'vertical', 'square');
                                        sideImageContent.classList.add('multi-part');
                                    }
                                } else {
                                    // Single image
                                    const img = new Image();
                                    img.onload = function() {
                                        elements.sideImage.src = result.path;
                                        elements.sideImage.style.height = '100%';
                                        elements.sideImage2.classList.add('hidden');
                                        
                                        // Detect aspect ratio and apply appropriate class
                                        const aspectRatio = img.width / img.height;
                                        const sideImageContent = document.getElementById('sideImageContent');
                                        if (sideImageContent) {
                                            sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                                            if (aspectRatio > 1.3) {
                                                sideImageContent.classList.add('horizontal');
                                            } else if (aspectRatio < 0.8) {
                                                sideImageContent.classList.add('vertical');
                                            } else {
                                                sideImageContent.classList.add('square');
                                            }
                                        }
                                    };
                                    img.src = result.path;
                                }
                                
                                // Reset to hidden state
                                elements.sideImageDisplay.classList.add('hidden');
                                elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
                            }
                        });
                    }
                });
            }
        } else if (firstMedia.type === 'video') {
            // Show loading overlay
            showVideoLoading();
            
            // Try to get cached video first
            const cachedVideo = mediaPreloader.getCachedVideo(firstMedia.id);
            if (cachedVideo) {
                // Use cached video immediately
                hideVideoLoading();
                // Hide image placeholder, show video placeholder
                const imagePlaceholder = document.getElementById('imagePlaceholder');
                const videoPlaceholder = document.getElementById('videoPlaceholder');
                if (imagePlaceholder) imagePlaceholder.classList.add('hidden');
                if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
                
                elements.mediaVideo.src = cachedVideo.path;
                elements.mediaVideo.load();
                elements.mediaVideo.muted = false; // Videos play with sound
                elements.mediaVideo.pause(); // Don't auto-play yet
                
                // Detect video aspect ratio when metadata loads
                elements.mediaVideo.onloadedmetadata = function() {
                    const aspectRatio = this.videoWidth / this.videoHeight;
                    const mediaContainer = elements.mediaVideo.closest('.media-container');
                    if (mediaContainer) {
                        mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                        if (aspectRatio > 1.3) {
                            mediaContainer.classList.add('horizontal');
                        } else if (aspectRatio < 0.8) {
                            mediaContainer.classList.add('vertical');
                        } else {
                            mediaContainer.classList.add('square');
                        }
                    }
                };
                
                // Reset to hidden state
                elements.sideImageDisplay.classList.add('hidden');
                elements.mediaOverlay.classList.add('hidden');
                elements.mediaOverlay.classList.remove('active', 'slide-out-right');
            } else {
                // Try force loading first, then fallback to original method
                mediaPreloader.forceLoadMedia(firstMedia.id, 'video').then((cachedResult) => {
                    if (cachedResult) {
                        hideVideoLoading();
                        // Use the force-loaded cached result
                        // Hide image placeholder, show video placeholder
                        const imagePlaceholder = document.getElementById('imagePlaceholder');
                        const videoPlaceholder = document.getElementById('videoPlaceholder');
                        if (imagePlaceholder) imagePlaceholder.classList.add('hidden');
                        if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
                        
                        elements.mediaVideo.src = cachedResult.path;
                        elements.mediaVideo.load();
                        elements.mediaVideo.muted = false; // Videos play with sound
                        elements.mediaVideo.pause(); // Don't auto-play yet
                        
                        // Detect video aspect ratio when metadata loads
                        elements.mediaVideo.onloadedmetadata = function() {
                            const aspectRatio = this.videoWidth / this.videoHeight;
                            const mediaContainer = elements.mediaVideo.closest('.media-container');
                            if (mediaContainer) {
                                mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                                if (aspectRatio > 1.3) {
                                    mediaContainer.classList.add('horizontal');
                                } else if (aspectRatio < 0.8) {
                                    mediaContainer.classList.add('vertical');
                                } else {
                                    mediaContainer.classList.add('square');
                                }
                            }
                        };
                        
                        // Reset to hidden state
                        elements.sideImageDisplay.classList.add('hidden');
                        elements.mediaOverlay.classList.add('hidden');
                        elements.mediaOverlay.classList.remove('active', 'slide-out-right');
                    } else {
                        // Fallback to original loading method
                        tryLoadVideo(firstMedia.id, (path) => {
                            hideVideoLoading();
                            if (path) {
                                // Hide image placeholder, show video placeholder
                                const imagePlaceholder = document.getElementById('imagePlaceholder');
                                const videoPlaceholder = document.getElementById('videoPlaceholder');
                                if (imagePlaceholder) imagePlaceholder.classList.add('hidden');
                                if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
                                
                                elements.mediaVideo.src = path;
                                elements.mediaVideo.load();
                                elements.mediaVideo.muted = false; // Videos play with sound
                                elements.mediaVideo.pause(); // Don't auto-play yet
                                
                                // Detect video aspect ratio when metadata loads
                                elements.mediaVideo.onloadedmetadata = function() {
                                    const aspectRatio = this.videoWidth / this.videoHeight;
                                    const mediaContainer = elements.mediaVideo.closest('.media-container');
                                    if (mediaContainer) {
                                        mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                                        if (aspectRatio > 1.3) {
                                            mediaContainer.classList.add('horizontal');
                                        } else if (aspectRatio < 0.8) {
                                            mediaContainer.classList.add('vertical');
                                        } else {
                                            mediaContainer.classList.add('square');
                                        }
                                    }
                                };
                                
                                // Reset to hidden state
                                elements.sideImageDisplay.classList.add('hidden');
                                elements.mediaOverlay.classList.add('hidden');
                                elements.mediaOverlay.classList.remove('active', 'slide-out-right');
                            }
                        });
                    }
                });
            }
        }
    } else if (tweet.hasImage) {
        // Hide second image by default
        elements.sideImage2.classList.add('hidden');
        
        // Show loading placeholder
        showImageLoading();
        
        // Try to get cached media first
        const cachedImage = mediaPreloader.getCachedImage(tweet.id);
        if (cachedImage) {
            // Use cached image immediately
            hideImageLoading();
            if (cachedImage.type === 'multi') {
                elements.sideImage.src = cachedImage.paths[0];
                elements.sideImage2.src = cachedImage.paths[1];
                elements.sideImage2.classList.remove('hidden');
                elements.sideImage.style.height = 'auto';
                
                const sideImageContent = document.getElementById('sideImageContent');
                if (sideImageContent) {
                    sideImageContent.classList.remove('horizontal', 'vertical', 'square');
                    sideImageContent.classList.add('multi-part');
                }
            } else {
                elements.sideImage.src = cachedImage.path;
                elements.sideImage.style.height = '100%';
                elements.sideImage2.classList.add('hidden');
                
                // Detect aspect ratio and apply appropriate class
                const aspectRatio = cachedImage.image.width / cachedImage.image.height;
                const sideImageContent = document.getElementById('sideImageContent');
                if (sideImageContent) {
                    sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                    if (aspectRatio > 1.3) {
                        sideImageContent.classList.add('horizontal');
                    } else if (aspectRatio < 0.8) {
                        sideImageContent.classList.add('vertical');
                    } else {
                        sideImageContent.classList.add('square');
                    }
                }
            }
            
            // Reset to hidden state
            elements.sideImageDisplay.classList.add('hidden');
            elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
        } else {
            // Try force loading first, then fallback to original method
            mediaPreloader.forceLoadMedia(tweet.id, 'image').then((cachedResult) => {
                if (cachedResult && cachedResult !== 'placeholder') {
                    hideImageLoading();
                    // Use the force-loaded cached result
                    if (cachedResult.type === 'multi') {
                        elements.sideImage.src = cachedResult.paths[0];
                        elements.sideImage2.src = cachedResult.paths[1];
                        elements.sideImage2.classList.remove('hidden');
                        elements.sideImage.style.height = 'auto';
                        
                        const sideImageContent = document.getElementById('sideImageContent');
                        if (sideImageContent) {
                            sideImageContent.classList.remove('horizontal', 'vertical', 'square');
                            sideImageContent.classList.add('multi-part');
                        }
                    } else {
                        elements.sideImage.src = cachedResult.path;
                        elements.sideImage.style.height = '100%';
                        elements.sideImage2.classList.add('hidden');
                        
                        // Detect aspect ratio and apply appropriate class
                        const aspectRatio = cachedResult.image.width / cachedResult.image.height;
                        const sideImageContent = document.getElementById('sideImageContent');
                        if (sideImageContent) {
                            sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                            if (aspectRatio > 1.3) {
                                sideImageContent.classList.add('horizontal');
                            } else if (aspectRatio < 0.8) {
                                sideImageContent.classList.add('vertical');
                            } else {
                                sideImageContent.classList.add('square');
                            }
                        }
                    }
                    
                    // Reset to hidden state
                    elements.sideImageDisplay.classList.add('hidden');
                    elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
                } else {
                    // Fallback to original loading method
                    tryLoadImage(tweet.id, (result) => {
                        hideImageLoading();
                        if (result !== 'placeholder') {
                            if (result.type === 'multi') {
                                // Multi-part image
                                elements.sideImage.src = result.paths[0];
                                elements.sideImage2.src = result.paths[1];
                                elements.sideImage2.classList.remove('hidden');
                                elements.sideImage.style.height = 'auto';
                                
                                const sideImageContent = document.getElementById('sideImageContent');
                                if (sideImageContent) {
                                    sideImageContent.classList.remove('horizontal', 'vertical', 'square');
                                    sideImageContent.classList.add('multi-part');
                                }
                            } else {
                                // Single image
                                const img = new Image();
                                img.onload = function() {
                                    elements.sideImage.src = result.path;
                                    elements.sideImage.style.height = '100%';
                                    elements.sideImage2.classList.add('hidden');
                                    
                                    // Detect aspect ratio and apply appropriate class
                                    const aspectRatio = img.width / img.height;
                                    const sideImageContent = document.getElementById('sideImageContent');
                                    if (sideImageContent) {
                                        sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                                        if (aspectRatio > 1.3) {
                                            sideImageContent.classList.add('horizontal');
                                        } else if (aspectRatio < 0.8) {
                                            sideImageContent.classList.add('vertical');
                                        } else {
                                            sideImageContent.classList.add('square');
                                        }
                                    }
                                };
                                img.src = result.path;
                            }
                            
                            // Reset to hidden state
                            elements.sideImageDisplay.classList.add('hidden');
                            elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
                        }
                    });
                }
            });
        }
    } else if (tweet.hasVideo) {
        // Show loading overlay
        showVideoLoading();
        
        // Try to get cached video first
        const cachedVideo = mediaPreloader.getCachedVideo(tweet.id);
        if (cachedVideo) {
            // Use cached video immediately
            hideVideoLoading();
            // Hide image placeholder, show video placeholder
            const imagePlaceholder = document.getElementById('imagePlaceholder');
            const videoPlaceholder = document.getElementById('videoPlaceholder');
            if (imagePlaceholder) imagePlaceholder.classList.add('hidden');
            if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
            
            elements.mediaVideo.src = cachedVideo.path;
            elements.mediaVideo.load();
            elements.mediaVideo.muted = false; // Videos play with sound
            elements.mediaVideo.pause(); // Don't auto-play yet
            
            // Detect video aspect ratio when metadata loads
            elements.mediaVideo.onloadedmetadata = function() {
                const aspectRatio = this.videoWidth / this.videoHeight;
                const mediaContainer = elements.mediaVideo.closest('.media-container');
                if (mediaContainer) {
                    mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                    if (aspectRatio > 1.3) {
                        mediaContainer.classList.add('horizontal');
                    } else if (aspectRatio < 0.8) {
                        mediaContainer.classList.add('vertical');
                    } else {
                        mediaContainer.classList.add('square');
                    }
                }
            };
            
            // Reset to hidden state
            elements.sideImageDisplay.classList.add('hidden');
            elements.mediaOverlay.classList.add('hidden');
            elements.mediaOverlay.classList.remove('active', 'slide-out-right');
        } else {
            // Try force loading first, then fallback to original method
            mediaPreloader.forceLoadMedia(tweet.id, 'video').then((cachedResult) => {
                if (cachedResult) {
                    hideVideoLoading();
                    // Use the force-loaded cached result
                    // Hide image placeholder, show video placeholder
                    const imagePlaceholder = document.getElementById('imagePlaceholder');
                    const videoPlaceholder = document.getElementById('videoPlaceholder');
                    if (imagePlaceholder) imagePlaceholder.classList.add('hidden');
                    if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
                    
                    elements.mediaVideo.src = cachedResult.path;
                    elements.mediaVideo.load();
                    elements.mediaVideo.muted = false; // Videos play with sound
                    elements.mediaVideo.pause(); // Don't auto-play yet
                    
                    // Detect video aspect ratio when metadata loads
                    elements.mediaVideo.onloadedmetadata = function() {
                        const aspectRatio = this.videoWidth / this.videoHeight;
                        const mediaContainer = elements.mediaVideo.closest('.media-container');
                        if (mediaContainer) {
                            mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                            if (aspectRatio > 1.3) {
                                mediaContainer.classList.add('horizontal');
                            } else if (aspectRatio < 0.8) {
                                mediaContainer.classList.add('vertical');
                            } else {
                                mediaContainer.classList.add('square');
                            }
                        }
                    };
                    
                    // Reset to hidden state
                    elements.sideImageDisplay.classList.add('hidden');
                    elements.mediaOverlay.classList.add('hidden');
                    elements.mediaOverlay.classList.remove('active', 'slide-out-right');
                } else {
                    // Fallback to original loading method
                    tryLoadVideo(tweet.id, (path) => {
                        hideVideoLoading();
                        if (path) {
                            // Hide image placeholder, show video placeholder
                            const imagePlaceholder = document.getElementById('imagePlaceholder');
                            const videoPlaceholder = document.getElementById('videoPlaceholder');
                            if (imagePlaceholder) imagePlaceholder.classList.add('hidden');
                            if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
                            
                            elements.mediaVideo.src = path;
                            elements.mediaVideo.load();
                            elements.mediaVideo.muted = false; // Videos play with sound
                            elements.mediaVideo.pause(); // Don't auto-play yet
                            
                            // Detect video aspect ratio when metadata loads
                            elements.mediaVideo.onloadedmetadata = function() {
                                const aspectRatio = this.videoWidth / this.videoHeight;
                                const mediaContainer = elements.mediaVideo.closest('.media-container');
                                if (mediaContainer) {
                                    mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                                    if (aspectRatio > 1.3) {
                                        mediaContainer.classList.add('horizontal');
                                    } else if (aspectRatio < 0.8) {
                                        mediaContainer.classList.add('vertical');
                                    } else {
                                        mediaContainer.classList.add('square');
                                    }
                                }
                            };
                            
                            // Reset to hidden state
                            elements.sideImageDisplay.classList.add('hidden');
                            elements.mediaOverlay.classList.add('hidden');
                            elements.mediaOverlay.classList.remove('active', 'slide-out-right');
                        }
                    });
                }
            });
        }
    } else {
        // No media - hide side displays and remove with-media class
        elements.sideImageDisplay.classList.add('hidden');
        elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
        elements.mediaOverlay.classList.add('hidden');
        elements.mediaOverlay.classList.remove('active', 'slide-out-right');
        elements.tweetCard.parentElement.classList.remove('with-media');
    }
}

// Start wave animation
function startWaveAnimation() {
    const tweet = timelineData[state.currentIndex];
    const text = tweet.text;
    const words = text.split(' ');
    let currentWord = 0;
    
    elements.tweetText.textContent = '';
    elements.eventSummary.classList.add('hidden');
    
    function typeWord() {
        if (currentWord < words.length && !state.slideOut) {
            elements.tweetText.textContent += (currentWord > 0 ? ' ' : '') + words[currentWord];
            currentWord++;
            state.textProgress = currentWord / words.length;
            
            typingTimer = setTimeout(typeWord, 50); // Faster, smoother typing
        } else if (!state.slideOut) {
            // Show event summary after text is complete
            setTimeout(() => {
                if (!state.slideOut) {
                    elements.eventSummary.classList.remove('hidden');
                    
                    // Show media with coordinated animation
                    setTimeout(() => {
                        if (!state.slideOut) {
                            if (tweet.hasMultipleMedia) {
                                // Media already loaded and shown in updateUI via updateMediaDisplay
                            } else if (tweet.hasImage && elements.sideImageDisplay && elements.sideImage.src) {
                                // Coordinate tweet shift and image slide-in
                                elements.tweetCard.parentElement.classList.add('with-media');
                                elements.sideImageDisplay.classList.remove('hidden');
                                requestAnimationFrame(() => {
                                    elements.sideImageDisplay.classList.add('active');
                                });
                            }
                            if (tweet.hasVideo && elements.mediaOverlay && elements.mediaVideo.src) {
                                // Coordinate tweet shift and video slide-in
                                elements.tweetCard.parentElement.classList.add('with-media');
                                elements.mediaOverlay.classList.remove('hidden');
                                requestAnimationFrame(() => {
                                    elements.mediaOverlay.classList.add('active');
                                });
                                // Play video after animation completes
                                setTimeout(() => {
                                    if (!state.slideOut && elements.mediaVideo.paused) {
                                        elements.mediaVideo.play().catch(e => console.log('Video play error:', e));
                                        updateBackgroundMusicVolume();
                                    }
                                }, 750);
                            }
                        }
                    }, 300);
                }
            }, 150);
        }
    }
    
    typeWord();
}

// Show full media
function showFullMedia() {
    const tweet = timelineData[state.currentIndex];
    state.showMedia = true;
    
    if (tweet.hasImage) {
        tryLoadImage(tweet.id, (result) => {
            if (result !== 'placeholder') {
                if (result.type === 'multi') {
                    elements.sideImage.src = result.paths[0];
                    elements.sideImage2.src = result.paths[1];
                    elements.sideImage2.classList.remove('hidden');
                } else {
                    elements.sideImage.src = result.path;
                    elements.sideImage2.classList.add('hidden');
                }
                elements.sideImageDisplay.classList.remove('hidden');
                requestAnimationFrame(() => {
                    elements.sideImageDisplay.classList.add('active');
                });
            }
        });
    }
    
    if (tweet.hasVideo) {
        tryLoadVideo(tweet.id, (path) => {
            if (path) {
                elements.mediaVideo.src = path;
                elements.mediaVideo.load();
                elements.mediaOverlay.classList.remove('hidden');
                requestAnimationFrame(() => {
                    elements.mediaOverlay.classList.add('active');
                });
                setTimeout(() => {
                    elements.mediaVideo.play().catch(e => console.log('Video play error:', e));
                    state.videoPaused = false;
                    updateBackgroundMusicVolume();
                }, 750);
            }
        });
    }
}

// Toggle video playback
function toggleVideoPlayback() {
    if (elements.mediaVideo.paused) {
        elements.mediaVideo.play();
        state.videoPaused = false;
        elements.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        elements.mediaVideo.pause();
        state.videoPaused = true;
        elements.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    updateBackgroundMusicVolume();
}

// Next media for multiple media tweets
function nextMedia() {
    const tweet = timelineData[state.currentIndex];
    if (!tweet.hasMultipleMedia || !tweet.mediaList) return;
    
    // Slide out current media
    elements.sideImageDisplay.classList.remove('active');
    elements.mediaOverlay.classList.remove('active');
    
    // Stop current video if playing
    if (elements.mediaVideo.src) {
        elements.mediaVideo.pause();
        elements.mediaVideo.currentTime = 0;
        elements.mediaVideo.src = '';
        updateBackgroundMusicVolume();
    }
    
    setTimeout(() => {
        // Hide current
        elements.sideImageDisplay.classList.add('hidden');
        elements.mediaOverlay.classList.add('hidden');
        
        // Switch to next
        state.currentMediaIndex = (state.currentMediaIndex + 1) % tweet.mediaList.length;
        
        // Load and slide in new media
        updateMediaDisplay();
    }, 300); // Match slide-out animation duration
}

// Previous media for multiple media tweets
function prevMedia() {
    const tweet = timelineData[state.currentIndex];
    if (!tweet.hasMultipleMedia || !tweet.mediaList) return;
    
    // Slide out current media
    elements.sideImageDisplay.classList.remove('active');
    elements.mediaOverlay.classList.remove('active');
    
    // Stop current video if playing
    if (elements.mediaVideo.src) {
        elements.mediaVideo.pause();
        elements.mediaVideo.currentTime = 0;
        elements.mediaVideo.src = '';
        updateBackgroundMusicVolume();
    }
    
    setTimeout(() => {
        // Hide current
        elements.sideImageDisplay.classList.add('hidden');
        elements.mediaOverlay.classList.add('hidden');
        
        // Switch to previous
        state.currentMediaIndex = (state.currentMediaIndex - 1 + tweet.mediaList.length) % tweet.mediaList.length;
        
        // Load and slide in new media
        updateMediaDisplay();
    }, 300); // Match slide-out animation duration
}

// Update media display for current media index
function updateMediaDisplay() {
    const tweet = timelineData[state.currentIndex];
    if (!tweet.hasMultipleMedia || !tweet.mediaList) return;
    
    const currentMedia = tweet.mediaList[state.currentMediaIndex];
    
    // Clear previous sources to prevent showing old media
    elements.sideImage.src = '';
    elements.mediaVideo.src = '';
    
    // Hide all media first
    elements.sideImageDisplay.classList.add('hidden');
    elements.mediaOverlay.classList.add('hidden');
    elements.sideImageDisplay.classList.remove('active');
    elements.mediaOverlay.classList.remove('active');
    
    if (currentMedia.type === 'image') {
        // Show image
        tryLoadImage(currentMedia.id, (result) => {
            if (result !== 'placeholder') {
                elements.sideImage.src = result.path;
                elements.sideImage.style.height = '100%';
                elements.sideImage2.classList.add('hidden');
                
                // Detect aspect ratio
                if (result.image) {
                    const aspectRatio = result.image.width / result.image.height;
                    const sideImageContent = document.getElementById('sideImageContent');
                    if (sideImageContent) {
                        sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                        if (aspectRatio > 1.3) {
                            sideImageContent.classList.add('horizontal');
                        } else if (aspectRatio < 0.8) {
                            sideImageContent.classList.add('vertical');
                        } else {
                            sideImageContent.classList.add('square');
                        }
                    }
                }
                
                // Slide in
                elements.sideImageDisplay.classList.remove('hidden');
                requestAnimationFrame(() => {
                    elements.sideImageDisplay.classList.add('active');
                });
            } else {
                // Retry once
                console.log('Image load failed for', currentMedia.id, '- retrying');
                tryLoadImage(currentMedia.id, (result2) => {
                    if (result2 !== 'placeholder') {
                        elements.sideImage.src = result2.path;
                        elements.sideImage.style.height = '100%';
                        elements.sideImage2.classList.add('hidden');
                        
                        // Detect aspect ratio
                        if (result2.image) {
                            const aspectRatio = result2.image.width / result2.image.height;
                            const sideImageContent = document.getElementById('sideImageContent');
                            if (sideImageContent) {
                                sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                                if (aspectRatio > 1.3) {
                                    sideImageContent.classList.add('horizontal');
                                } else if (aspectRatio < 0.8) {
                                    sideImageContent.classList.add('vertical');
                                } else {
                                    sideImageContent.classList.add('square');
                                }
                            }
                        }
                    } else {
                        // Show placeholder on final failure
                        elements.sideImage.src = 'images-videos/placeholder.jpg';
                        elements.sideImage.style.height = '100%';
                        elements.sideImage2.classList.add('hidden');
                        const sideImageContent = document.getElementById('sideImageContent');
                        if (sideImageContent) {
                            sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                            sideImageContent.classList.add('square');
                        }
                    }
                    
                    // Slide in
                    elements.sideImageDisplay.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        elements.sideImageDisplay.classList.add('active');
                    });
                });
            }
        });
    } else if (currentMedia.type === 'video') {
        // Show video
        tryLoadVideo(currentMedia.id, (path) => {
            if (path) {
                elements.mediaVideo.src = path;
                elements.mediaVideo.load();
                
                // Detect aspect ratio when metadata loads
                elements.mediaVideo.onloadedmetadata = function() {
                    const aspectRatio = this.videoWidth / this.videoHeight;
                    const mediaContainer = elements.mediaVideo.closest('.media-container');
                    if (mediaContainer) {
                        mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                        if (aspectRatio > 1.3) {
                            mediaContainer.classList.add('horizontal');
                        } else if (aspectRatio < 0.8) {
                            mediaContainer.classList.add('vertical');
                        } else {
                            mediaContainer.classList.add('square');
                        }
                    }
                    
                    // Slide in after metadata
                    elements.mediaOverlay.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        elements.mediaOverlay.classList.add('active');
                    });
                    
                    setTimeout(() => {
                        elements.mediaVideo.play().catch(e => console.log('Video play error:', e));
                        state.videoPaused = false;
                        updateBackgroundMusicVolume();
                    }, 750);
                };
                
                elements.mediaVideo.onerror = function() {
                    console.log('Video load error for', path, '- retrying');
                    // Retry once
                    tryLoadVideo(currentMedia.id, (path2) => {
                        if (path2) {
                            elements.mediaVideo.src = path2;
                            elements.mediaVideo.load();
                            
                            elements.mediaVideo.onloadedmetadata = function() {
                                const aspectRatio = this.videoWidth / this.videoHeight;
                                const mediaContainer = elements.mediaVideo.closest('.media-container');
                                if (mediaContainer) {
                                    mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                                    if (aspectRatio > 1.3) {
                                        mediaContainer.classList.add('horizontal');
                                    } else if (aspectRatio < 0.8) {
                                        mediaContainer.classList.add('vertical');
                                    } else {
                                        mediaContainer.classList.add('square');
                                    }
                                }
                                
                                elements.mediaOverlay.classList.remove('hidden');
                                requestAnimationFrame(() => {
                                    elements.mediaOverlay.classList.add('active');
                                });
                                
                                setTimeout(() => {
                                    elements.mediaVideo.play().catch(e => console.log('Video play error:', e));
                                    state.videoPaused = false;
                                    updateBackgroundMusicVolume();
                                }, 750);
                            };
                            
                            elements.mediaVideo.onerror = function() {
                                console.log('Video load retry failed for', path2, '- showing placeholder');
                                // Show placeholder image instead
                                elements.sideImage.src = 'images-videos/placeholder.jpg';
                                elements.sideImage.style.height = '100%';
                                elements.sideImage2.classList.add('hidden');
                                const sideImageContent = document.getElementById('sideImageContent');
                                if (sideImageContent) {
                                    sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                                    sideImageContent.classList.add('square');
                                }
                                elements.sideImageDisplay.classList.remove('hidden');
                                requestAnimationFrame(() => {
                                    elements.sideImageDisplay.classList.add('active');
                                });
                            };
                        } else {
                            // No path on retry, show placeholder
                            console.log('No video path on retry for', currentMedia.id, '- showing placeholder');
                            elements.sideImage.src = 'images-videos/placeholder.jpg';
                            elements.sideImage.style.height = '100%';
                            elements.sideImage2.classList.add('hidden');
                            const sideImageContent = document.getElementById('sideImageContent');
                            if (sideImageContent) {
                                sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                                sideImageContent.classList.add('square');
                            }
                            elements.sideImageDisplay.classList.remove('hidden');
                            requestAnimationFrame(() => {
                                elements.sideImageDisplay.classList.add('active');
                            });
                        }
                    });
                };
            } else {
                // No path, retry
                console.log('No video path for', currentMedia.id, '- retrying');
                tryLoadVideo(currentMedia.id, (path2) => {
                    if (path2) {
                        elements.mediaVideo.src = path2;
                        elements.mediaVideo.load();
                        
                        elements.mediaVideo.onloadedmetadata = function() {
                            const aspectRatio = this.videoWidth / this.videoHeight;
                            const mediaContainer = elements.mediaVideo.closest('.media-container');
                            if (mediaContainer) {
                                mediaContainer.classList.remove('horizontal', 'vertical', 'square');
                                if (aspectRatio > 1.3) {
                                    mediaContainer.classList.add('horizontal');
                                } else if (aspectRatio < 0.8) {
                                    mediaContainer.classList.add('vertical');
                                } else {
                                    mediaContainer.classList.add('square');
                                }
                            }
                            
                            elements.mediaOverlay.classList.remove('hidden');
                            requestAnimationFrame(() => {
                                elements.mediaOverlay.classList.add('active');
                            });
                            
                            setTimeout(() => {
                                elements.mediaVideo.play().catch(e => console.log('Video play error:', e));
                                state.videoPaused = false;
                                updateBackgroundMusicVolume();
                            }, 750);
                        };
                        
                        elements.mediaVideo.onerror = function() {
                            console.log('Video load retry failed for', path2, '- showing placeholder');
                            elements.sideImage.src = 'images-videos/placeholder.jpg';
                            elements.sideImage.style.height = '100%';
                            elements.sideImage2.classList.add('hidden');
                            const sideImageContent = document.getElementById('sideImageContent');
                            if (sideImageContent) {
                                sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                                sideImageContent.classList.add('square');
                            }
                            elements.sideImageDisplay.classList.remove('hidden');
                            requestAnimationFrame(() => {
                                elements.sideImageDisplay.classList.add('active');
                            });
                        };
                    } else {
                        // No path on retry, show placeholder
                        console.log('No video path on retry for', currentMedia.id, '- showing placeholder');
                        elements.sideImage.src = 'images-videos/placeholder.jpg';
                        elements.sideImage.style.height = '100%';
                        elements.sideImage2.classList.add('hidden');
                        const sideImageContent = document.getElementById('sideImageContent');
                        if (sideImageContent) {
                            sideImageContent.classList.remove('horizontal', 'vertical', 'square', 'multi-part');
                            sideImageContent.classList.add('square');
                        }
                        elements.sideImageDisplay.classList.remove('hidden');
                        requestAnimationFrame(() => {
                            elements.sideImageDisplay.classList.add('active');
                        });
                    }
                });
            }
        });
    }
}

// Handle auto mode
function handleAutoMode() {
    if (!state.autoMode) return;
    
    const tweet = timelineData[state.currentIndex];
    let delay = 5000; // Base delay
    
    // Add extra time if media is showing
    if (state.showMedia) {
        if (tweet.hasVideo && !state.videoPaused) {
            // Wait for video to finish
            return;
        }
        delay += 3000;
    }
    
    autoTimer = setTimeout(() => {
        if (state.autoMode && state.currentIndex < timelineData.length - 1) {
            handleNext();
        }
    }, delay);
}

// Handle next - completes current step before moving
function handleNext() {
    if (state.currentIndex >= timelineData.length - 1) {
        // Show final message when at the end
        showFinalMessage();
        return;
    }
    
    const tweet = timelineData[state.currentIndex];
    
    // Step 1: If text is still typing, complete it instantly
    if (state.textProgress < 1 && !state.isAnimating) {
        cleanupTimers();
        elements.tweetText.textContent = tweet.text;
        state.textProgress = 1;
        elements.eventSummary.classList.remove('hidden');
        
        // Show media after completing text
        if (tweet.hasImage && elements.sideImageDisplay && elements.sideImage.src) {
            elements.tweetCard.parentElement.classList.add('with-media');
            elements.sideImageDisplay.classList.remove('hidden');
            requestAnimationFrame(() => {
                elements.sideImageDisplay.classList.add('active');
            });
        }
        if (tweet.hasVideo && elements.mediaOverlay && elements.mediaVideo.src) {
            elements.tweetCard.parentElement.classList.add('with-media');
            elements.mediaOverlay.classList.remove('hidden');
            requestAnimationFrame(() => {
                elements.mediaOverlay.classList.add('active');
            });
            setTimeout(() => {
                if (!state.slideOut && elements.mediaVideo.paused) {
                    elements.mediaVideo.play().catch(e => console.log('Video play error:', e));
                }
            }, 750);
        }
        return;
    }
    
    // Step 2: If media is loading/appearing, wait for it to complete
    if ((tweet.hasImage || tweet.hasVideo) && !elements.sideImageDisplay.classList.contains('active') && 
        !elements.mediaOverlay.classList.contains('active') && !state.isAnimating) {
        // Media needs to appear first
        if (tweet.hasImage && elements.sideImageDisplay && elements.sideImage.src) {
            elements.tweetCard.parentElement.classList.add('with-media');
            elements.sideImageDisplay.classList.remove('hidden');
            requestAnimationFrame(() => {
                elements.sideImageDisplay.classList.add('active');
            });
        }
        if (tweet.hasVideo && elements.mediaOverlay && elements.mediaVideo.src) {
            elements.tweetCard.parentElement.classList.add('with-media');
            elements.mediaOverlay.classList.remove('hidden');
            requestAnimationFrame(() => {
                elements.mediaOverlay.classList.add('active');
            });
            setTimeout(() => {
                if (!state.slideOut && elements.mediaVideo.paused) {
                    elements.mediaVideo.play().catch(e => console.log('Video play error:', e));
                }
            }, 750);
        }
        return;
    }
    
    // Step 3: Everything complete, move to next tweet
    if (!state.isAnimating) {
        cleanupTimers();
        state.isAnimating = true;
        state.slideOut = true;
        
        // Play whoosh sound
        playWhoosh();
        
        // Slide out tweet to LEFT and media to RIGHT simultaneously
        elements.tweetCard.classList.add('slide-out-left');
        elements.sideImageDisplay.classList.remove('active');
        elements.mediaOverlay.classList.remove('active');
        
        setTimeout(() => {
            // Get skip value from input
            const skipValue = parseInt(document.getElementById('skipInput').value) || 1;
            state.currentIndex += skipValue;
            // Ensure we don't go past the end
            if (state.currentIndex >= timelineData.length) {
                state.currentIndex = timelineData.length - 1;
            }
            state.textProgress = 0;
            state.showMedia = false;
            state.slideOut = false;
            state.isAnimating = false;
            state.videoPaused = false;
            state.currentMediaIndex = 0; // Reset media index
            
            // Pause and reset video
            if (elements.mediaVideo.src) {
                elements.mediaVideo.pause();
                elements.mediaVideo.currentTime = 0;
                elements.mediaVideo.src = '';
                updateBackgroundMusicVolume();
            }
            
            // Clean up classes
            elements.tweetCard.classList.remove('slide-out-left', 'slide-out-right');
            elements.tweetCard.parentElement.classList.remove('with-media');
            elements.mediaOverlay.classList.remove('active', 'slide-out-right');
            elements.mediaOverlay.classList.add('hidden');
            elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
            elements.sideImageDisplay.classList.add('hidden');
            elements.eventSummary.classList.add('hidden');
            
            // Clean up memory before loading new content
            cleanupMediaMemory();
            
            updateUI();
            startWaveAnimation();
            updateDotTimeline();
            updateMonthDisplay();
            
            // Preload media for upcoming tweets
            mediaPreloader.preloadMedia(timelineData, state.currentIndex);
            
            if (state.autoMode) {
                handleAutoMode();
            }
        }, 500);
    }
}

// Handle previous
function handlePrevious() {
    if (state.currentIndex > 0 && !state.isAnimating) {
        // Clear all timers
        cleanupTimers();
        
        state.autoMode = false;
        state.isAnimating = true;
        state.slideOut = true;
        
        // Play whoosh sound
        playWhoosh();
        
        // Slide out in opposite direction (to the right)
        elements.tweetCard.classList.add('slide-out-right');
        elements.sideImageDisplay.classList.remove('active');
        elements.mediaOverlay.classList.remove('active');
        
        setTimeout(() => {
            // Get skip value from input
            const skipValue = parseInt(document.getElementById('skipInput').value) || 1;
            state.currentIndex -= skipValue;
            // Ensure we don't go below 0
            if (state.currentIndex < 0) {
                state.currentIndex = 0;
            }
            state.textProgress = 0;
            state.showMedia = false;
            state.slideOut = false;
            state.isAnimating = false;
            state.videoPaused = false;
            state.currentMediaIndex = 0; // Reset media index
            
            // Pause and reset video
            if (elements.mediaVideo.src) {
                elements.mediaVideo.pause();
                elements.mediaVideo.currentTime = 0;
                elements.mediaVideo.src = '';
                updateBackgroundMusicVolume();
            }
            
            elements.tweetCard.classList.remove('slide-out-left', 'slide-out-right');
            elements.tweetCard.parentElement.classList.remove('with-media');
            elements.mediaOverlay.classList.remove('active', 'slide-out-right');
            elements.mediaOverlay.classList.add('hidden');
            elements.sideImageDisplay.classList.remove('active', 'slide-out-right');
            elements.sideImageDisplay.classList.add('hidden');
            elements.smallImagePreview.classList.add('hidden');
            elements.smallVideoPreview.classList.add('hidden');
            elements.eventSummary.classList.add('hidden');
            
            // Clean up memory before loading new content
            cleanupMediaMemory();
            
            updateUI();
            startWaveAnimation();
            updateDotTimeline();
            updateMonthDisplay();
            
            // Preload media for upcoming tweets
            mediaPreloader.preloadMedia(timelineData, state.currentIndex);
        }, 500);
    }
}

// Play background music
function playBackgroundMusic() {
    if (elements.bgMusic && state.started) {
        elements.bgMusic.volume = state.isMuted ? 0 : 0.75;
        elements.bgMusic.play().catch(e => console.log("Audio play failed:", e));
    }
}

// Play whoosh sound effect
function playWhoosh() {
    if (elements.whooshSound && !state.isMuted) {
        elements.whooshSound.currentTime = 0;
        elements.whooshSound.volume = 0.4;
        elements.whooshSound.play().catch(e => console.log("Whoosh play failed:", e));
    }
}

// Handle video end
function handleVideoEnd() {
    if (state.autoMode) {
        setTimeout(() => {
            handleNext();
        }, 1000);
    }
}

// Clean up timers
function cleanupTimers() {
    if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }
    if (mediaTimer) {
        clearTimeout(mediaTimer);
        mediaTimer = null;
    }
    if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
    }
    if (waveTimer) {
        clearTimeout(waveTimer);
        waveTimer = null;
    }
}

// Create dot timeline - shows 11 dots (5 before, current, 5 after)
function createDotTimeline() {
    const container = document.getElementById('dotTimelineContainer');
    const datesContainer = document.getElementById('dotTimelineDates');
    
    if (!container || !datesContainer) return;
    
    updateDotTimeline();
}

// Update dot timeline - sliding window of 11 dots
function updateDotTimeline() {
    const container = document.getElementById('dotTimelineContainer');
    const datesContainer = document.getElementById('dotTimelineDates');
    
    if (!container || !datesContainer) return;
    
    container.innerHTML = '';
    datesContainer.innerHTML = '';
    
    const currentIndex = state.currentIndex;
    const totalTweets = timelineData.length;
    
    // Calculate visible range: 5 before, current, 5 after
    const visibleRange = 11;
    const halfRange = 5;
    
    let startIndex = Math.max(0, currentIndex - halfRange);
    let endIndex = Math.min(totalTweets - 1, currentIndex + halfRange);
    
    // Adjust if at the beginning or end
    if (currentIndex < halfRange) {
        endIndex = Math.min(totalTweets - 1, visibleRange - 1);
    }
    if (currentIndex > totalTweets - halfRange - 1) {
        startIndex = Math.max(0, totalTweets - visibleRange);
    }
    
    // Create dots for visible range
    for (let i = startIndex; i <= endIndex; i++) {
        const tweet = timelineData[i];
        const dot = document.createElement('div');
        dot.className = 'timeline-dot';
        dot.dataset.index = i;
        
        // Position dots evenly across the container
        const position = ((i - startIndex) / (endIndex - startIndex)) * 100;
        dot.style.left = `${position}%`;
        
        // Style based on position relative to current
        if (i === currentIndex) {
            dot.classList.add('active', 'current');
        } else if (i < currentIndex) {
            dot.classList.add('passed');
        }
        
        dot.addEventListener('click', () => {
            if (!state.isAnimating) {
                jumpToTweet(i);
            }
        });
        
        container.appendChild(dot);
        
        // Add date label for all dots
        const dateLabel = document.createElement('div');
        dateLabel.className = i === currentIndex ? 'date-label current-date' : 'date-label';
        dateLabel.textContent = tweet.date;
        dateLabel.style.left = `${position}%`;
        dateLabel.style.fontSize = i === currentIndex ? '0.85rem' : '0.65rem';
        dateLabel.style.opacity = i === currentIndex ? '1' : '0.6';
        datesContainer.appendChild(dateLabel);
    }
}

// Jump to specific tweet
function jumpToTweet(index) {
    if (index === state.currentIndex) return;
    
    cleanupTimers();
    state.isAnimating = true;
    state.slideOut = true;
    
    elements.tweetCard.classList.add('slide-out');
    
    setTimeout(() => {
        state.currentIndex = index;
        state.textProgress = 0;
        state.showMedia = false;
        state.slideOut = false;
        state.isAnimating = false;
        state.currentMediaIndex = 0; // Reset media index
        
        elements.tweetCard.classList.remove('slide-out');
        updateUI();
        startWaveAnimation();
        updateDotTimeline();
        updateMonthDisplay();
        
        // Preload media for upcoming tweets
        mediaPreloader.preloadMedia(timelineData, state.currentIndex);
        
        if (state.autoMode) {
            handleAutoMode();
        }
    }, 300);
}

// Update month display
function updateMonthDisplay() {
    const currentMonth = document.getElementById('currentMonth');
    if (currentMonth) {
        const tweet = timelineData[state.currentIndex];
        currentMonth.textContent = tweet.month;
    }
}

// Toggle mute
function toggleMute() {
    if (!elements.bgMusic) return;
    
    state.isMuted = !state.isMuted;
    elements.bgMusic.muted = state.isMuted;
    
    if (state.isMuted) {
        elements.muteBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
    } else {
        elements.muteBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
    }
}

// Toggle auto mode
function toggleAutoMode() {
    state.autoMode = !state.autoMode;
    
    if (elements.autoBtn) {
        if (state.autoMode) {
            elements.autoBtn.classList.add('active');
            handleAutoMode();
        } else {
            elements.autoBtn.classList.remove('active');
            if (autoTimer) {
                clearTimeout(autoTimer);
                autoTimer = null;
            }
        }
    }
}

// Update background music volume
function updateBackgroundMusicVolume() {
    if (!elements.bgMusic || state.isMuted) return;
    
    const tweet = timelineData[state.currentIndex];
    const targetVolume = (tweet.hasVideo && !state.videoPaused && !elements.mediaVideo.paused) ? 0.15 : 0.75;
    
    // Smooth volume transition
    const currentVolume = elements.bgMusic.volume;
    const volumeDiff = targetVolume - currentVolume;
    const steps = 20;
    const stepSize = volumeDiff / steps;
    const stepDuration = 30; // ms
    
    let step = 0;
    const volumeInterval = setInterval(() => {
        step++;
        if (step >= steps) {
            elements.bgMusic.volume = targetVolume;
            clearInterval(volumeInterval);
        } else {
            elements.bgMusic.volume = currentVolume + (stepSize * step);
        }
    }, stepDuration);
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Clean up on page unload
window.addEventListener('beforeunload', cleanupTimers);

// Show final message when reaching the end
function showFinalMessage() {
    const finalMessage = document.getElementById('finalMessage');
    if (finalMessage) {
        finalMessage.classList.remove('hidden');
        setTimeout(() => {
            finalMessage.classList.add('show');
        }, 100);
    }
}
