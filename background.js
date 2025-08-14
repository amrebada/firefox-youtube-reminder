// Background script for YouTube Video Reminders extension
// Handles notifications, alarms, and reminder management

// Initialize background script
browser.runtime.onInstalled.addListener(async () => {
    console.log('YouTube Video Reminders extension installed');

    // Set up initial storage structure if needed
    browser.storage.local.get(['reminders']).then((result) => {
        if (!result.reminders) {
            browser.storage.local.set({ reminders: [] });
        }
    });

    // Check notification permissions

    if (!browser.notifications) {
        console.error('Notifications API not available');
    }

});

// Handle alarm events for reminders
browser.alarms.onAlarm.addListener(async (alarm) => {
    console.log('Alarm triggered:', alarm.name);

    if (alarm.name.startsWith('reminder_')) {
        const reminderId = alarm.name.replace('reminder_', '');
        await handleReminderAlarm(reminderId);
    } else if (alarm.name === 'cleanup') {
        await cleanupReminders();
    }
});

// Handle notification clicks
browser.notifications.onClicked.addListener(async (notificationId) => {
    console.log('Notification clicked:', notificationId);

    if (notificationId.startsWith('reminder_')) {
        const reminderId = notificationId.replace('reminder_', '');
        await handleNotificationClick(reminderId);
    }
});

// Handle messages from content scripts and popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);

    switch (request.action) {
        case 'openReminderPopup':
            // Store video data temporarily for popup access
            browser.storage.local.set({
                tempVideoData: request.videoData,
                tempVideoDataExpiry: Date.now() + 60000 // Expire in 1 minute
            });
            // Note: Firefox doesn't support programmatic popup opening
            // User needs to click the extension icon to open popup
            break;

        case 'createReminder':
            handleCreateReminder(request.reminderData);
            break;

        case 'deleteReminder':
            handleDeleteReminder(request.reminderId);
            break;

        default:
            console.log('Unknown message action:', request.action);
    }
});

async function handleReminderAlarm(reminderId) {
    try {
        // Get reminder data from storage
        const result = await browser.storage.local.get('reminders');
        const reminders = result.reminders || [];
        const reminder = reminders.find(r => r.id === reminderId);

        if (!reminder) {
            console.log('Reminder not found:', reminderId);
            return;
        }

        // Create notification
        await createReminderNotification(reminder);

        // Schedule next reminder
        await scheduleNextReminder(reminder);

        console.log('Reminder notification sent for:', reminder.title);

    } catch (error) {
        console.error('Error handling reminder alarm:', error);
    }
}

async function createReminderNotification(reminder) {
    try {
        // Check if notifications are supported and permissions are granted
        if (!browser.notifications) {
            console.error('Notifications API not available');
            return;
        }

        const notificationOptions = {
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-48.jpg'),
            title: '📹 Video Reminder',
            message: `Time to watch: ${reminder.title}`
        };

        // Firefox may not support contextMessage
        if (reminder.channel) {
            notificationOptions.message += `\n${reminder.channel} • ${formatInterval(reminder.interval)}`;
        }

        console.log('Creating notification with options:', notificationOptions);

        // Use reminder ID as notification ID for easy reference
        const notificationId = await browser.notifications.create(`reminder_${reminder.id}`, notificationOptions);
        console.log('Notification created with ID:', notificationId);

        // Auto-clear notification after 10 seconds if user doesn't interact
        setTimeout(() => {
            browser.notifications.clear(`reminder_${reminder.id}`);
        }, 10000);

    } catch (error) {
        console.error('Error creating notification:', error);
        // Fallback: try to create a simple notification
        try {
            await browser.notifications.create(`reminder_${reminder.id}`, {
                type: 'basic',
                title: 'Video Reminder',
                message: `Time to watch: ${reminder.title}`
            });
            console.log('Fallback notification created');
        } catch (fallbackError) {
            console.error('Fallback notification also failed:', fallbackError);
        }
    }
}

async function scheduleNextReminder(reminder) {
    try {
        // Calculate next reminder time
        const nextTime = calculateNextReminderTime(reminder.interval);

        // Update reminder in storage
        const result = await browser.storage.local.get('reminders');
        const reminders = result.reminders || [];
        const reminderIndex = reminders.findIndex(r => r.id === reminder.id);

        if (reminderIndex !== -1) {
            reminders[reminderIndex].nextReminder = nextTime;
            reminders[reminderIndex].lastTriggered = Date.now();
            await browser.storage.local.set({ reminders: reminders });
        }

        // Create new alarm
        const alarmName = `reminder_${reminder.id}`;
        await browser.alarms.create(alarmName, { when: nextTime });

        console.log('Next reminder scheduled for:', new Date(nextTime));

    } catch (error) {
        console.error('Error scheduling next reminder:', error);
    }
}

function calculateNextReminderTime(interval) {
    const now = Date.now();
    const intervals = {
        '1mi': 1 * 60 * 1000,        // 1 minutes
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

async function handleNotificationClick(reminderId) {
    try {
        // Get reminder data
        const result = await browser.storage.local.get('reminders');
        const reminders = result.reminders || [];
        const reminder = reminders.find(r => r.id === reminderId);

        if (!reminder) {
            console.log('Reminder not found for notification click:', reminderId);
            return;
        }

        // Open video in new tab
        await browser.tabs.create({
            url: reminder.url,
            active: true
        });

        // Clear the notification
        await browser.notifications.clear(`reminder_${reminderId}`);

        console.log('Opened video from notification:', reminder.title);

    } catch (error) {
        console.error('Error handling notification click:', error);
    }
}

// Note: Firefox doesn't support notification buttons, so we removed the button click handler
// Users can click the notification itself to open the video

async function snoozeReminder(reminderId, snoozeTime) {
    try {
        const alarmName = `reminder_${reminderId}`;
        const snoozeUntil = Date.now() + snoozeTime;

        // Clear existing alarm
        await browser.alarms.clear(alarmName);

        // Create new alarm for snooze time
        await browser.alarms.create(alarmName, { when: snoozeUntil });

        console.log('Reminder snoozed until:', new Date(snoozeUntil));

        // Show snooze confirmation (Note: snooze functionality removed for Firefox compatibility)
        await browser.notifications.create('snooze_confirmation', {
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-48.jpg'),
            title: '⏰ Reminder Snoozed',
            message: 'You\'ll be reminded again in 1 hour'
        });

        // Auto-clear snooze confirmation after 3 seconds
        setTimeout(() => {
            browser.notifications.clear('snooze_confirmation');
        }, 3000);

    } catch (error) {
        console.error('Error snoozing reminder:', error);
    }
}

async function handleCreateReminder(reminderData) {
    try {
        // This function can be called from popup or content script
        console.log('Creating reminder:', reminderData);

        // The actual reminder creation is handled in popup.js
        // This is here for potential future direct creation from content script

    } catch (error) {
        console.error('Error creating reminder:', error);
    }
}

async function handleDeleteReminder(reminderId) {
    try {
        // Remove reminder from storage
        const result = await browser.storage.local.get('reminders');
        const reminders = result.reminders || [];
        const updatedReminders = reminders.filter(r => r.id !== reminderId);
        await browser.storage.local.set({ reminders: updatedReminders });

        // Clear associated alarm
        await browser.alarms.clear(`reminder_${reminderId}`);

        console.log('Reminder deleted:', reminderId);

    } catch (error) {
        console.error('Error deleting reminder:', error);
    }
}

function formatInterval(interval) {
    const formats = {
        '1mi': 'Every 1 Minutes',
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

// Clean up old notifications on startup
browser.runtime.onStartup.addListener(() => {
    browser.notifications.getAll().then(notifications => {
        Object.keys(notifications).forEach(notificationId => {
            if (notificationId.startsWith('reminder_') || notificationId === 'snooze_confirmation') {
                browser.notifications.clear(notificationId);
            }
        });
    });
});

// Periodic cleanup of expired or invalid reminders
browser.alarms.create('cleanup', { delayInMinutes: 60, periodInMinutes: 60 });

async function cleanupReminders() {
    try {
        const result = await browser.storage.local.get('reminders');
        const reminders = result.reminders || [];

        // Remove reminders that are very old or invalid
        const now = Date.now();
        const sixMonthsAgo = now - (6 * 30 * 24 * 60 * 60 * 1000);

        const validReminders = reminders.filter(reminder => {
            return reminder.createdAt > sixMonthsAgo && reminder.videoId;
        });

        if (validReminders.length !== reminders.length) {
            await browser.storage.local.set({ reminders: validReminders });
            console.log('Cleaned up old reminders');
        }

    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

console.log('YouTube Video Reminders background script loaded');

