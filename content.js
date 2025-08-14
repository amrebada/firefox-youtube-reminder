// Content script for YouTube Video Reminders extension
// Runs on YouTube pages to extract video information and add reminder functionality

(function() {
    'use strict';

    let currentVideoData = null;
    let reminderButton = null;

    // Initialize content script
    initialize();

    function initialize() {
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupVideoDetection);
        } else {
            setupVideoDetection();
        }

        // Listen for URL changes (YouTube is a SPA)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(setupVideoDetection, 1000); // Delay to allow page to render
            }
        }).observe(document, { subtree: true, childList: true });
    }

    function setupVideoDetection() {
        // Check if we're on a video page
        if (isVideoPage()) {
            extractVideoInfo();
            addReminderButton();
        } else {
            removeReminderButton();
        }
    }

    function isVideoPage() {
        return window.location.pathname === '/watch' && window.location.search.includes('v=');
    }

    function extractVideoInfo() {
        try {
            const videoId = new URLSearchParams(window.location.search).get('v');
            
            // Get video title
            const titleElement = document.querySelector('h1.title yt-formatted-string, h1 yt-formatted-string, #title h1 yt-formatted-string');
            const title = titleElement ? titleElement.textContent.trim() : document.title;

            // Get channel name
            const channelElement = document.querySelector('#text.ytd-channel-name a, #channel-name #text, .ytd-channel-name a');
            const channel = channelElement ? channelElement.textContent.trim() : 'Unknown Channel';

            // Get video thumbnail
            const thumbnailElement = document.querySelector('video');
            const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

            currentVideoData = {
                id: videoId,
                title: title,
                channel: channel,
                thumbnail: thumbnail,
                url: window.location.href
            };

            console.log('Video data extracted:', currentVideoData);
        } catch (error) {
            console.error('Error extracting video info:', error);
        }
    }

    function addReminderButton() {
        // Remove existing button if any
        removeReminderButton();

        // Find a good place to add the button (next to like/dislike buttons)
        const targetContainer = document.querySelector('#actions .ytd-menu-renderer, #top-level-buttons-computed, #actions');
        
        if (!targetContainer) {
            console.log('Could not find suitable container for reminder button');
            return;
        }

        // Create reminder button
        reminderButton = document.createElement('button');
        reminderButton.className = 'yt-reminder-btn';
        reminderButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/>
            </svg>
            Set Reminder
        `;
        
        
        reminderButton.addEventListener('click', openReminderPopup);
        
        // Insert button
        targetContainer.appendChild(reminderButton);
        
        console.log('Reminder button added to page');
    }

    function removeReminderButton() {
        if (reminderButton && reminderButton.parentNode) {
            reminderButton.parentNode.removeChild(reminderButton);
            reminderButton = null;
        }
    }

    function openReminderPopup() {
        // Send message to background script to store video data
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.sendMessage({
                action: 'openReminderPopup',
                videoData: currentVideoData
            });
            
            // Show notification to user about clicking extension icon
            showTemporaryNotification('Click the extension icon to set a reminder for this video!');
        }
    }
    
    function showTemporaryNotification(message) {
        // Create and show a temporary notification on the page
        const notification = document.createElement('div');
        notification.className = 'yt-reminder-notification';
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    // Listen for messages from popup
    if (typeof browser !== 'undefined' && browser.runtime) {
        browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'getVideoInfo') {
                sendResponse(currentVideoData);
            }
        });
    }

    // Notify that content script is ready
    console.log('YouTube Video Reminders content script loaded');
})();
