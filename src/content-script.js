// Constants
const SELECTORS = {
  ADD_AD_BUTTON: 'ytcp-button#add-ad-break',
  TIMELINE_MARKERS: 'ytve-timeline-markers',
  TIMESTAMP_INPUT_FIELD: 'ytcp-media-timestamp-input #container input',
  ACTIVE_ROW: '.ad-break-row[active]',
  TIMESTAMP_INPUT: 'ytve-framestamp-input input'
};

let isPlacing = false;

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'placeAds' && !isPlacing) {
    console.log('Starting ad placement with config:', message.config);
    
    placeAds(message.config)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    
    return true; // Keeps the message channel open for sendResponse
  }
});

// Function to get video duration from 'maximumMs' in projection attribute
function getVideoDuration() {
  const timelineMarkers = document.querySelector(SELECTORS.TIMELINE_MARKERS);
  if (!timelineMarkers) {
    throw new Error("Timeline markers not found! Make sure the video is loaded.");
  }

  const projectionAttr = timelineMarkers.getAttribute('projection');
  if (!projectionAttr) {
    throw new Error("Projection attribute not found on timeline markers.");
  }

  let projection;
  try {
    projection = JSON.parse(projectionAttr);
  } catch (e) {
    throw new Error("Failed to parse projection attribute JSON.");
  }

  // Extract maximumMs and convert to seconds
  const maximumMs = projection.maximumMs;
  if (typeof maximumMs !== 'number') {
    throw new Error("maximumMs not found or invalid in projection attribute.");
  }

  const durationSeconds = maximumMs / 1000;

  console.log('Video duration in seconds:', durationSeconds);
  return durationSeconds;
}

// Utility function to wait for an element to appear in the DOM
async function waitForElement(selector, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await sleep(5);
  }
  
  throw new Error(`Timeout waiting for element: ${selector}`);
}

// Utility function to simulate complete mouse click
async function simulateMouseClick(element) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0, // Left button
  };

  const mousedownEvent = new MouseEvent('mousedown', eventInit);
  element.dispatchEvent(mousedownEvent);
  await sleep(5);

  const mouseupEvent = new MouseEvent('mouseup', eventInit);
  element.dispatchEvent(mouseupEvent);

  const clickEvent = new MouseEvent('click', eventInit);
  element.dispatchEvent(clickEvent);
}

// Function to place an ad at a specific timestamp
async function placeAdAtTimestamp(timestamp) {
  
  // Step 1: Find the timestamp input field
  const timestampInputSelector = SELECTORS.TIMESTAMP_INPUT_FIELD;
  const timestampInput = await waitForElement(timestampInputSelector);
  if (!timestampInput) {
    throw new Error(`Timestamp input field not found using selector: ${timestampInputSelector}`);
  }
  
  // Step 2: Set the desired value and dispatch events
  console.log(`Setting timestamp input to: ${timestamp}`);
  timestampInput.value = timestamp;
  timestampInput.dispatchEvent(new Event('input', { bubbles: true }));
  timestampInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Step 3: Click the "Add Ad" button using the simulation function
  const addAdButton = await waitForElement(SELECTORS.ADD_AD_BUTTON);
  if (!addAdButton) {
    throw new Error(`Add Ad button not found using selector: ${SELECTORS.ADD_AD_BUTTON}`);
  }
  
  await simulateMouseClick(addAdButton);
  
  console.log(`Ad placed at timestamp: ${timestamp}`);
}

// Function to calculate ad timestamps based on duration and config
function calculateAdTimestamps(duration, config) {
  const timestamps = [];
  
  // If you want to add multiple ads near the start,
  // convert them to 4-part format as well:
  timestamps.push('00:00:00:00');
  timestamps.push('00:00:00:00');
  timestamps.push('00:00:00:01');

  let currentTime = parseInt(config.interval, 10);
  
  while (currentTime < duration) {
    const formatted = formatTimestamp(currentTime);
    timestamps.push(formatted);
    timestamps.push(incrementFrame(formatted));
    currentTime += parseInt(config.interval, 10);
  }
  
  // Convert final 'duration' to a string before pushing
  const endTimestamp = formatTimestamp(duration);
  timestamps.push(endTimestamp);
  timestamps.push(incrementFrame(endTimestamp));
  
  return timestamps;
}

/**
 * Format seconds into 4-part timestamp: "HH:MM:SS:FF"
 * (We keep frames as "00" by default here.)
 */
function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}:00`; // Always produce 4 parts
}

// Utility function to pad numbers with leading zeros
function pad(num) {
  return num.toString().padStart(2, '0');
}

// Utility function to pause execution for a specified duration (in ms)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to place ads based on the provided configuration
async function placeAds(config) {
  if (isPlacing) return;
  isPlacing = true;

  try {
    const duration = getVideoDuration();
    const timestamps = calculateAdTimestamps(duration, config);
    
    console.log('Calculated timestamps:', timestamps);
    
    for (let i = 0; i < timestamps.length; i++) {
      await placeAdAtTimestamp(timestamps[i]);
    }
    
  } catch (error) {
    throw error;
  } finally {
    isPlacing = false;
  }
}

// Increments the frame count in a timestamp string.
function incrementFrame(timestamp, maxFrames = 30) {
  // Split the timestamp into its components
  const parts = timestamp.split(':');
  
  // Determine the format based on the number of parts
  let hasHours = false;
  if (parts.length === 3) {
    // Format: MM:SS:FF
    hasHours = false;
  } else if (parts.length === 4) {
    // Format: HH:MM:SS:FF
    hasHours = true;
  } else {
    throw new Error('Timestamp must be in "MM:SS:FF" or "HH:MM:SS:FF" format.');
  }
  
  // Parse each component to integers
  let [hours, minutes, seconds, frames] = hasHours
    ? [
        parseInt(parts[0], 10),
        parseInt(parts[1], 10),
        parseInt(parts[2], 10),
        parseInt(parts[3], 10)
      ]
    : [0, parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10)];
  
  // Validate the parsed numbers
  const validateNumber = (num, name) => {
    if (isNaN(num) || num < 0) {
      throw new Error(
        `Invalid ${name} value in timestamp: "${timestamp}". Each part must be a non-negative integer.`
      );
    }
  };
  
  if (hasHours) {
    validateNumber(hours, 'hours');
  }
  validateNumber(minutes, 'minutes');
  validateNumber(seconds, 'seconds');
  validateNumber(frames, 'frames');
  
  // Increment the frame count
  frames += 1;
  
  // Handle frame overflow
  if (frames >= maxFrames) {
    frames = 0;
    seconds += 1;
    
    // Handle second overflow
    if (seconds >= 60) {
      seconds = 0;
      minutes += 1;
      
      // Handle minute overflow
      if (minutes >= 60) {
        minutes = 0;
        if (hasHours) {
          hours += 1;
        } else {
          // If no hours are present, reset to "00:00:00"
          hours = 0;
        }
      }
    }
  }
  
  // Reconstruct the timestamp
  const pad2 = (num) => num.toString().padStart(2, '0');
  const newTimestamp = hasHours
    ? `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad2(frames)}`
    : `${pad2(minutes)}:${pad2(seconds)}:${pad2(frames)}`;
  
  return newTimestamp;
}
