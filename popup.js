// Popup script for YouTube Video Reminders extension

document.addEventListener('DOMContentLoaded', function() {
    const currentVideoDiv = document.getElementById('currentVideo');
    const notYoutubeDiv = document.getElementById('notYoutube');
    const setReminderBtn = document.getElementById('setReminder');
    const successMessage = document.getElementById('successMessage');
    const remindersList = document.getElementById('remindersList');

    // Initialize popup
    initializePopup();

    // Event listeners
    setReminderBtn.addEventListener('click', setReminder);

    async function initializePopup() {
        try {
            // First check for temporary video data from content script
            const storage = await browser.storage.local.get(['tempVideoData', 'tempVideoDataExpiry']);
            let hasVideoData = false;
            
            if (storage.tempVideoData && storage.tempVideoDataExpiry && Date.now() < storage.tempVideoDataExpiry) {
                // Use temporary video data
                await displayVideoFromData(storage.tempVideoData);
                currentVideoDiv.style.display = 'block';
                notYoutubeDiv.style.display = 'none';
                hasVideoData = true;
                
                // Clear temporary data
                browser.storage.local.remove(['tempVideoData', 'tempVideoDataExpiry']);
            } else {
                // Get current active tab
                const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                const currentTab = tabs[0];

                if (isYouTubeVideo(currentTab.url)) {
                    await displayCurrentVideo(currentTab);
                    currentVideoDiv.style.display = 'block';
                    notYoutubeDiv.style.display = 'none';
                    hasVideoData = true;
                }
            }
            
            if (!hasVideoData) {
                currentVideoDiv.style.display = 'none';
                notYoutubeDiv.style.display = 'block';
            }

            // Load and display existing reminders
            await loadReminders();
        } catch (error) {
            console.error('Error initializing popup:', error);
        }
    }

    function isYouTubeVideo(url) {
        const youtubeVideoRegex = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/;
        return youtubeVideoRegex.test(url);
    }
    
    function displayVideoFromData(videoData) {
        try {
            document.getElementById('videoTitle').textContent = videoData.title || 'Unknown Video';
            document.getElementById('videoChannel').textContent = videoData.channel || 'Unknown Channel';
            document.getElementById('videoThumbnail').src = videoData.thumbnail || `https://img.youtube.com/vi/${videoData.id}/mqdefault.jpg`;
            
            // Store video data for reminder creation
            window.currentVideoData = {
                id: videoData.id,
                url: videoData.url,
                title: videoData.title || 'Unknown Video',
                channel: videoData.channel || 'Unknown Channel',
                thumbnail: videoData.thumbnail || `https://img.youtube.com/vi/${videoData.id}/mqdefault.jpg`
            };
        } catch (error) {
            console.error('Error displaying video from data:', error);
        }
    }

    async function displayCurrentVideo(tab) {
        try {
            // Extract video ID from URL
            const videoId = extractVideoId(tab.url);
            if (!videoId) return;

            // Get video information from content script
            const videoInfo = await browser.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });
            
            if (videoInfo && videoInfo.title) {
                document.getElementById('videoTitle').textContent = videoInfo.title;
                document.getElementById('videoChannel').textContent = videoInfo.channel || 'Unknown Channel';
                document.getElementById('videoThumbnail').src = videoInfo.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
            } else {
                // Fallback to basic info
                document.getElementById('videoTitle').textContent = tab.title;
                document.getElementById('videoChannel').textContent = 'YouTube';
                document.getElementById('videoThumbnail').src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
            }

            // Store current video data for reminder creation
            window.currentVideoData = {
                id: videoId,
                url: tab.url,
                title: videoInfo?.title || tab.title,
                channel: videoInfo?.channel || 'YouTube',
                thumbnail: videoInfo?.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
            };
        } catch (error) {
            console.error('Error displaying current video:', error);
        }
    }

    function extractVideoId(url) {
        const match = url.match(/[?&]v=([^&#]*)/);
        return match ? match[1] : null;
    }

    async function setReminder() {
        if (!window.currentVideoData) {
            showMessage('Error: No video data available', 'error');
            return;
        }

        try {
            setReminderBtn.disabled = true;
            setReminderBtn.textContent = 'Setting...';

            const interval = document.getElementById('reminderInterval').value;
            const note = document.getElementById('reminderNote').value;

            const reminder = {
                id: generateUniqueId(),
                videoId: window.currentVideoData.id,
                url: window.currentVideoData.url,
                title: window.currentVideoData.title,
                channel: window.currentVideoData.channel,
                thumbnail: window.currentVideoData.thumbnail,
                interval: interval,
                note: note,
                createdAt: Date.now(),
                nextReminder: calculateNextReminder(interval)
            };

            // Save reminder to storage
            await saveReminder(reminder);

            // Create alarm for notification
            await createReminderAlarm(reminder);

            // Show success message
            showSuccessMessage();

            // Reload reminders list
            await loadReminders();

            // Reset form
            document.getElementById('reminderNote').value = '';

        } catch (error) {
            console.error('Error setting reminder:', error);
            showMessage('Error setting reminder', 'error');
        } finally {
            setReminderBtn.disabled = false;
            setReminderBtn.textContent = 'Set Reminder';
        }
    }

    function generateUniqueId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function calculateNextReminder(interval) {
        const now = Date.now();
        const intervals = {
            '1mi': 1 * 60 * 1000,        // 1 minute
            '1h': 60 * 60 * 1000,        // 1 hour
            '2h': 2 * 60 * 60 * 1000,    // 2 hours
            '6h': 6 * 60 * 60 * 1000,    // 6 hours
            '12h': 12 * 60 * 60 * 1000,  // 12 hours
            '1d': 24 * 60 * 60 * 1000,   // 1 day
            '2d': 2 * 24 * 60 * 60 * 1000, // 2 days
            '3d': 3 * 24 * 60 * 60 * 1000, // 3 days
            '1w': 7 * 24 * 60 * 60 * 1000, // 1 week
            '2w': 14 * 24 * 60 * 60 * 1000, // 2 weeks
            '1m': 30 * 24 * 60 * 60 * 1000  // 1 month (approximate)
        };

        return now + (intervals[interval] || intervals['1d']);
    }

    async function saveReminder(reminder) {
        const result = await browser.storage.local.get('reminders');
        const reminders = result.reminders || [];
        reminders.push(reminder);
        await browser.storage.local.set({ reminders: reminders });
    }

    async function createReminderAlarm(reminder) {
        const alarmName = `reminder_${reminder.id}`;
        await browser.alarms.create(alarmName, {
            when: reminder.nextReminder
        });
    }

    async function loadReminders() {
        try {
            const result = await browser.storage.local.get('reminders');
            const reminders = result.reminders || [];
            
            displayReminders(reminders);
        } catch (error) {
            console.error('Error loading reminders:', error);
        }
    }

    function displayReminders(reminders) {
        remindersList.innerHTML = '';

        if (reminders.length === 0) {
            remindersList.innerHTML = '<div class="empty-state">No active reminders</div>';
            return;
        }

        reminders.forEach(reminder => {
            const reminderElement = createReminderElement(reminder);
            remindersList.appendChild(reminderElement);
        });
    }

    function createReminderElement(reminder) {
        const div = document.createElement('div');
        div.className = 'reminder-item';
        
        // Create thumbnail element
        const thumbnail = document.createElement('div');
        thumbnail.className = 'reminder-thumbnail';
        thumbnail.style.backgroundImage = `url(${encodeURI(reminder.thumbnail)})`;
        
        // Create info container
        const info = document.createElement('div');
        info.className = 'reminder-info';
        
        const channel = document.createElement('div');
        channel.className = 'reminder-channel';
        channel.textContent = reminder.note;
        
        const title = document.createElement('div');
        title.className = 'reminder-title';
        title.textContent = reminder.title;
        
        const interval = document.createElement('div');
        interval.className = 'reminder-interval';
        interval.textContent = `${formatInterval(reminder.interval)} • ${reminder.channel}`;
        
        info.appendChild(channel);
        info.appendChild(title);
        info.appendChild(interval);
        
        // Create actions container
        const actions = document.createElement('div');
        actions.className = 'reminder-actions';
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn-small btn-view';
        viewBtn.setAttribute('data-url', reminder.url);
        viewBtn.textContent = 'View';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-small btn-delete';
        deleteBtn.setAttribute('data-reminder-id', reminder.id);
        deleteBtn.textContent = 'Delete';
        
        actions.appendChild(viewBtn);
        actions.appendChild(deleteBtn);
        
        // Assemble the final element
        div.appendChild(thumbnail);
        div.appendChild(info);
        div.appendChild(actions);
        
        // Add event listeners
        const viewBtnElement = div.querySelector('.btn-view');
        const deleteBtnElement = div.querySelector('.btn-delete');
        
        viewBtnElement.addEventListener('click', async () => {
            try {
                await browser.tabs.create({ url: reminder.url, active: true });
                window.close();
            } catch (error) {
                console.error('Error opening video:', error);
            }
        });
        
        deleteBtnElement.addEventListener('click', async () => {
            await deleteReminder(reminder.id);
        });
        
        return div;
    }

    function formatInterval(interval) {
        const formats = {
            '1mi': 'Every 1 Minute',
            '1h': 'Every Hour',
            '2h': 'Every 2 Hours',
            '6h': 'Every 6 Hours',
            '12h': 'Every 12 Hours',
            '1d': 'Daily',
            '2d': 'Every 2 Days',
            '3d': 'Every 3 Days',
            '1w': 'Weekly',
            '2w': 'Every 2 Weeks',
            '1m': 'Monthly'
        };
        return formats[interval] || interval;
    }

    // Helper function for deleting reminders
    async function deleteReminder(reminderId) {
        try {
            // Remove from storage
            const result = await browser.storage.local.get('reminders');
            const reminders = result.reminders || [];
            const updatedReminders = reminders.filter(r => r.id !== reminderId);
            await browser.storage.local.set({ reminders: updatedReminders });

            // Clear alarm
            await browser.alarms.clear(`reminder_${reminderId}`);

            // Reload reminders list
            await loadReminders();
        } catch (error) {
            console.error('Error deleting reminder:', error);
        }
    }

    function showSuccessMessage() {
        successMessage.style.display = 'block';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 3000);
    }

    function showMessage(message, type = 'info') {
        // Create temporary message element
        const messageEl = document.createElement('div');
        messageEl.className = `message-${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            z-index: 1000;
        `;
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            messageEl.remove();
        }, 3000);
    }
});
