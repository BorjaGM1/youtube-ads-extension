let isPlacing = false;

function updateStatus(message, type = 'info') {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
}

function updateButton(disabled) {
  const button = document.getElementById('startPlacement');
  button.disabled = disabled;
  button.textContent = disabled ? 'Placing Ads...' : 'Start Placement';
}

document.getElementById('interval').addEventListener('input', function(e) {
  // Ensure the value is at least 1
  if (this.value < 1) this.value = 1;
});

document.getElementById('startPlacement').addEventListener('click', async () => {
  if (isPlacing) return;
  
  const interval = document.getElementById('interval').value;
  
  if (!interval || interval < 1) {
    updateStatus('Please enter a valid interval', 'error');
    return;
  }

  isPlacing = true;
  updateButton(true);
  updateStatus('Starting ad placement...');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'placeAds',
      config: {
        interval: parseInt(interval)
      }
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    updateStatus('Ad placement started successfully!', 'success');
  } catch (error) {
    console.error('Error:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('receiving end does not exist')) {
      errorMessage = 'Please navigate to YouTube Studio monetization tab';
    }
    
    updateStatus(errorMessage, 'error');
  } finally {
    isPlacing = false;
    updateButton(false);
  }
});