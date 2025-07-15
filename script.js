// Global variables
let collegeData = {};
let userState = '';
let userCity = '';
let selectedColleges = [];
let map;
let markers = [];
let scatterCanvas;
let scatterCtx;
let hoveredPoint = null;
let isMouseDown = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadCollegeData();
    initializeMap();
    initializeScatterPlot();
    setupEventListeners();
    detectUserLocation();
});

// Detect user location based on IP address
async function detectUserLocation() {
    try {
        console.log('Detecting user location...');
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        console.log('Location data:', data);
        
        if (data.city && data.region_code) {
            // Pre-populate the form fields
            const cityInput = document.getElementById('homeCity');
            const stateSelect = document.getElementById('homeState');
            
            cityInput.value = data.city;
            stateSelect.value = data.region_code;
            
            console.log(`Pre-populated location: ${data.city}, ${data.region_code}`);
            
            // Show a subtle notification
            showNotification(`Detected your location: ${data.city}, ${data.region_code}. You can change this if needed.`, 'location');
        }
    } catch (error) {
        console.log('Could not detect location:', error);
        // Don't show error to user, just continue without pre-population
    }
}

// Calculate travel estimates between two locations
async function calculateTravelEstimates(origin, destination) {
    try {
        // Use Google Maps Distance Matrix API (free tier allows 100 requests/day)
        const apiKey = 'AIzaSyB41DRUbKWJHPxaFjMAwdrzWzbVKartNGg'; // This is a demo key - in production, use your own
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&key=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
            const element = data.rows[0].elements[0];
            const drivingDistance = element.distance.text;
            const drivingDuration = element.duration.text;
            
            // Estimate driving cost (assuming $0.50 per mile for gas + wear & tear)
            const distanceMiles = parseFloat(element.distance.text.replace(' mi', '').replace(',', ''));
            const drivingCost = Math.round(distanceMiles * 0.50);
            
            // Estimate flight cost and time (rough estimates based on distance)
            let flightCost, flightDuration;
            if (distanceMiles < 300) {
                // Too close to fly economically
                flightCost = null;
                flightDuration = null;
            } else if (distanceMiles < 800) {
                // Regional flight
                flightCost = Math.round(150 + (distanceMiles * 0.15));
                flightDuration = Math.round(distanceMiles / 500) + 'h ' + Math.round((distanceMiles % 500) / 8) + 'm';
            } else {
                // Long distance flight
                flightCost = Math.round(200 + (distanceMiles * 0.12));
                flightDuration = Math.round(distanceMiles / 500) + 'h ' + Math.round((distanceMiles % 500) / 8) + 'm';
            }
            
            return {
                driving: {
                    distance: drivingDistance,
                    duration: drivingDuration,
                    cost: drivingCost
                },
                flying: flightCost ? {
                    cost: flightCost,
                    duration: flightDuration
                } : null
            };
        }
    } catch (error) {
        console.log('Error calculating travel estimates:', error);
    }
    
    // Fallback estimates if API fails
    return getFallbackTravelEstimates(origin, destination);
}

// Fallback travel estimation using rough distance calculations
function getFallbackTravelEstimates(origin, destination) {
    // Extract state from destination (assuming format: "City, State")
    const destParts = destination.split(', ');
    const destState = destParts[destParts.length - 1];
    const originParts = origin.split(', ');
    const originState = originParts[originParts.length - 1];
    
    // Rough distance estimation based on state locations
    const stateDistances = {
        'CA': { lat: 36.7783, lng: -119.4179 },
        'TX': { lat: 31.9686, lng: -99.9018 },
        'NY': { lat: 42.1657, lng: -74.9481 },
        'FL': { lat: 27.6648, lng: -81.5158 },
        'IL': { lat: 40.6331, lng: -89.3985 },
        'PA': { lat: 40.5908, lng: -77.2098 },
        'OH': { lat: 40.4173, lng: -82.9071 },
        'GA': { lat: 32.1656, lng: -82.9001 },
        'NC': { lat: 35.7596, lng: -79.0193 },
        'MI': { lat: 44.3148, lng: -85.6024 },
        'NJ': { lat: 40.0583, lng: -74.4057 },
        'VA': { lat: 37.7693, lng: -78.1700 },
        'WA': { lat: 47.4009, lng: -121.4905 },
        'AZ': { lat: 33.7298, lng: -111.4312 },
        'MA': { lat: 42.2304, lng: -71.5301 },
        'TN': { lat: 35.7478, lng: -86.6923 },
        'IN': { lat: 39.8494, lng: -86.2583 },
        'MO': { lat: 38.4561, lng: -92.2884 },
        'MD': { lat: 39.0639, lng: -76.8021 },
        'CO': { lat: 39.5501, lng: -105.7821 }
    };
    
    const originCoords = stateDistances[originState];
    const destCoords = stateDistances[destState];
    
    if (originCoords && destCoords) {
        // Calculate rough distance using Haversine formula
        const R = 3959; // Earth's radius in miles
        const dLat = (destCoords.lat - originCoords.lat) * Math.PI / 180;
        const dLng = (destCoords.lng - originCoords.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(originCoords.lat * Math.PI / 180) * Math.cos(destCoords.lat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distanceMiles = Math.round(R * c);
        
        // Estimate driving time (assuming 60 mph average)
        const drivingHours = Math.round(distanceMiles / 60);
        const drivingMinutes = Math.round((distanceMiles % 60) / 60 * 60);
        const drivingDuration = `${drivingHours}h ${drivingMinutes}m`;
        const drivingDistance = `${distanceMiles} mi`;
        const drivingCost = Math.round(distanceMiles * 0.50);
        
        // Estimate flight cost and time
        let flightCost, flightDuration;
        if (distanceMiles < 300) {
            flightCost = null;
            flightDuration = null;
        } else if (distanceMiles < 800) {
            flightCost = Math.round(150 + (distanceMiles * 0.15));
            flightDuration = Math.round(distanceMiles / 500) + 'h ' + Math.round((distanceMiles % 500) / 8) + 'm';
        } else {
            flightCost = Math.round(200 + (distanceMiles * 0.12));
            flightDuration = Math.round(distanceMiles / 500) + 'h ' + Math.round((distanceMiles % 500) / 8) + 'm';
        }
        
        return {
            driving: {
                distance: drivingDistance,
                duration: drivingDuration,
                cost: drivingCost
            },
            flying: flightCost ? {
                cost: flightCost,
                duration: flightDuration
            } : null
        };
    }
    
    // Final fallback
    return {
        driving: {
            distance: 'Unknown',
            duration: 'Unknown',
            cost: 0
        },
        flying: null
    };
}

// Load college data from JSON file
async function loadCollegeData() {
    try {
        const response = await fetch('top_engineering_colleges.json');
        collegeData = await response.json();
        populateCollegeSelect();
    } catch (error) {
        console.error('Error loading college data:', error);
        alert('Error loading college data. Please refresh the page.');
    }
}

// Initialize Leaflet map
function initializeMap() {
    map = L.map('map').setView([39.8283, -98.5795], 4); // Center of US
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// Initialize scatter plot
function initializeScatterPlot() {
    console.log('Initializing scatter plot...');
    
    try {
        scatterCanvas = document.getElementById('scatterPlot');
        console.log('Canvas element:', scatterCanvas);
        if (!scatterCanvas) {
            console.warn('Scatter plot canvas not found, skipping initialization');
            return;
        }
        
        scatterCtx = scatterCanvas.getContext('2d');
        console.log('Canvas context:', scatterCtx);
        if (!scatterCtx) {
            console.warn('Could not get 2D context for scatter plot');
            return;
        }
        
        // Set canvas size to match container
        const container = scatterCanvas.parentElement;
        scatterCanvas.width = container.offsetWidth - 40; // Account for padding
        scatterCanvas.height = container.offsetHeight - 60; // Account for padding and title
        
        console.log('Canvas size set to:', scatterCanvas.width, 'x', scatterCanvas.height);
        
        // Add mouse event listeners
        scatterCanvas.addEventListener('mousemove', handleScatterMouseMove);
        scatterCanvas.addEventListener('click', handleScatterClick);
        scatterCanvas.addEventListener('mouseleave', handleScatterMouseLeave);
        scatterCanvas.addEventListener('mousedown', () => { isMouseDown = true; });
        scatterCanvas.addEventListener('mouseup', () => { isMouseDown = false; });
        
        // Draw initial empty chart
        drawScatterPlot();
        console.log('Scatter plot initialized successfully!');
        
    } catch (error) {
        console.error('Error initializing scatter plot:', error);
    }
}

// Handle mouse move on scatter plot
function handleScatterMouseMove(event) {
    if (!scatterCtx || selectedColleges.length === 0) return;
    
    const rect = scatterCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const padding = 80; // Increased padding for better spacing
    const chartWidth = scatterCanvas.width - 2 * padding;
    const chartHeight = scatterCanvas.height - 2 * padding;
    
    // Check if mouse is within chart area
    if (x < padding || x > scatterCanvas.width - padding || 
        y < padding || y > scatterCanvas.height - padding) {
        hoveredPoint = null;
        drawScatterPlot();
        return;
    }
    
    // Find closest point using (0,0) origin system
    const costs = selectedColleges.map(college => {
        const isInState = college.state === userState;
        return isInState ? college.in_state_total_cost : college.out_of_state_total_cost;
    });
    const earnings = selectedColleges.map(college => college.expected_earnings_after_graduation);
    
    const maxCost = Math.max(...costs);
    const maxEarnings = Math.max(...earnings);
    
    // Round up to nice numbers for axis labels
    const niceMaxCost = Math.ceil(maxCost / 10000) * 10000;
    const niceMaxEarnings = Math.ceil(maxEarnings / 10000) * 10000;
    
    let closestPoint = null;
    let minDistance = Infinity;
    
    selectedColleges.forEach((college, index) => {
        const isInState = college.state === userState;
        const cost = isInState ? college.in_state_total_cost : college.out_of_state_total_cost;
        const earnings = college.expected_earnings_after_graduation;
        
        // Map coordinates with (0,0) at bottom-left
        const pointX = padding + (cost / niceMaxCost) * chartWidth;
        const pointY = scatterCanvas.height - padding - (earnings / niceMaxEarnings) * chartHeight;
        
        const distance = Math.sqrt((x - pointX) ** 2 + (y - pointY) ** 2);
        
        if (distance < minDistance && distance < 15) { // 15px hover radius
            minDistance = distance;
            closestPoint = { college, pointX, pointY };
        }
    });
    
    hoveredPoint = closestPoint;
    drawScatterPlot();
}

// Handle click on scatter plot
function handleScatterClick(event) {
    if (hoveredPoint) {
        const college = hoveredPoint.college;
        const isInState = college.state === userState;
        const cost = isInState ? college.in_state_total_cost : college.out_of_state_total_cost;
        
        // Build travel information
        let travelInfo = '';
        if (college.travelEstimates) {
            const driving = college.travelEstimates.driving;
            const flying = college.travelEstimates.flying;
            
            travelInfo = `\n🚗 Driving: ${driving.duration} (${driving.distance}) - $${driving.cost}`;
            
            if (flying) {
                travelInfo += `\n✈️ Flying: ${flying.duration} - $${flying.cost}`;
            } else {
                travelInfo += `\n✈️ Flying: Too close to fly economically`;
            }
        }
        
        alert(`${college.name}\n\n` +
              `Program: ${college.programType === 'mechanical_engineering' ? 'Mechanical Engineering' : 'Biomedical Engineering'}\n` +
              `Location: ${college.city}, ${college.state}\n` +
              `Total Cost: ${formatCurrency(cost)}\n` +
              `Expected Earnings: ${formatCurrency(college.expected_earnings_after_graduation)}` +
              travelInfo);
    }
}

// Handle mouse leave scatter plot
function handleScatterMouseLeave() {
    hoveredPoint = null;
    drawScatterPlot();
}

// Draw scatter plot
function drawScatterPlot() {
    if (!scatterCtx || !scatterCanvas) return;
    
    const width = scatterCanvas.width;
    const height = scatterCanvas.height;
    const padding = 80; // Increased padding for better spacing
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    
    // Clear canvas
    scatterCtx.fillStyle = '#f8fafc';
    scatterCtx.fillRect(0, 0, width, height);
    
    // Draw grid
    scatterCtx.strokeStyle = '#e2e8f0';
    scatterCtx.lineWidth = 1;
    
    // Vertical grid lines
    for (let i = 0; i <= 5; i++) {
        const x = padding + (i / 5) * chartWidth;
        scatterCtx.beginPath();
        scatterCtx.moveTo(x, padding);
        scatterCtx.lineTo(x, height - padding);
        scatterCtx.stroke();
    }
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
        const y = padding + (i / 5) * chartHeight;
        scatterCtx.beginPath();
        scatterCtx.moveTo(padding, y);
        scatterCtx.lineTo(width - padding, y);
        scatterCtx.stroke();
    }
    
    // Draw axes
    scatterCtx.strokeStyle = '#4a5568';
    scatterCtx.lineWidth = 2;
    scatterCtx.beginPath();
    scatterCtx.moveTo(padding, padding);
    scatterCtx.lineTo(padding, height - padding);
    scatterCtx.lineTo(width - padding, height - padding);
    scatterCtx.stroke();
    
    // Draw labels
    scatterCtx.fillStyle = '#4a5568';
    scatterCtx.font = '14px Verdana';
    scatterCtx.textAlign = 'center';
    
    // X-axis label with units
    scatterCtx.fillText('Total Cost of Attendance ($)', width / 2, height - 10);
    
    // Y-axis label with units - moved further left for more space
    scatterCtx.save();
    scatterCtx.translate(35, height / 2); // Increased from 20 to 35 for more space
    scatterCtx.rotate(-Math.PI / 2);
    scatterCtx.fillText('Expected Earnings After Graduation ($)', 0, 0);
    scatterCtx.restore();
    
    // Draw axis tick labels if we have data
    if (selectedColleges.length > 0) {
        const costs = selectedColleges.map(college => {
            const isInState = college.state === userState;
            return isInState ? college.in_state_total_cost : college.out_of_state_total_cost;
        });
        const earnings = selectedColleges.map(college => college.expected_earnings_after_graduation);
        
        // Set axis ranges with (0,0) as origin
        const maxCost = Math.max(...costs);
        const maxEarnings = Math.max(...earnings);
        
        // Round up to nice numbers for axis labels
        const niceMaxCost = Math.ceil(maxCost / 10000) * 10000;
        const niceMaxEarnings = Math.ceil(maxEarnings / 10000) * 10000;
        
        // X-axis tick labels (0 to maxCost)
        scatterCtx.font = '10px Verdana';
        scatterCtx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const x = padding + (i / 5) * chartWidth;
            const value = (i / 5) * niceMaxCost;
            scatterCtx.fillText(formatCurrency(value), x, height - padding + 15);
        }
        
        // Y-axis tick labels (0 to maxEarnings) - moved further right for more space
        scatterCtx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const y = height - padding - (i / 5) * chartHeight; // Flip Y-axis so 0 is at bottom
            const value = (i / 5) * niceMaxEarnings;
            scatterCtx.fillText(formatCurrency(value), padding - 15, y + 3); // Increased from -5 to -15
        }
        
        // Draw data points
        selectedColleges.forEach((college, index) => {
            const isInState = college.state === userState;
            const cost = isInState ? college.in_state_total_cost : college.out_of_state_total_cost;
            const earnings = college.expected_earnings_after_graduation;
            
            // Map coordinates with (0,0) at bottom-left
            const x = padding + (cost / niceMaxCost) * chartWidth;
            const y = height - padding - (earnings / niceMaxEarnings) * chartHeight;
            
            // Check if this point is being hovered
            const isHovered = hoveredPoint && hoveredPoint.college === college;
            
            // Draw point with different size for hover
            const pointSize = isHovered ? 8 : 6;
            scatterCtx.fillStyle = college.programType === 'mechanical_engineering' ? '#3b82f6' : '#ef4444';
            scatterCtx.beginPath();
            scatterCtx.arc(x, y, pointSize, 0, 2 * Math.PI);
            scatterCtx.fill();
            
            // Draw border
            scatterCtx.strokeStyle = '#2d3748';
            scatterCtx.lineWidth = isHovered ? 2 : 1;
            scatterCtx.stroke();
            
            // Draw hover tooltip
            if (isHovered) {
                const isInState = college.state === userState;
                const cost = isInState ? college.in_state_total_cost : college.out_of_state_total_cost;
                const earnings = college.expected_earnings_after_graduation;
                
                // Create tooltip content
                const tooltipLines = [
                    college.name,
                    `Cost: ${formatCurrency(cost)}`,
                    `Earnings: ${formatCurrency(earnings)}`
                ];
                
                scatterCtx.font = '12px Verdana';
                scatterCtx.fillStyle = '#2d3748';
                scatterCtx.textAlign = 'center';
                
                // Calculate tooltip dimensions
                const lineHeight = 16;
                const tooltipPadding = 8;
                const tooltipHeight = tooltipLines.length * lineHeight + tooltipPadding;
                let maxTextWidth = 0;
                
                // Find the widest line
                tooltipLines.forEach(line => {
                    const textWidth = scatterCtx.measureText(line).width;
                    maxTextWidth = Math.max(maxTextWidth, textWidth);
                });
                
                const tooltipWidth = maxTextWidth + 2 * tooltipPadding;
                
                // Position tooltip above the point
                let tooltipX = x - tooltipWidth / 2;
                let tooltipY = y - pointSize - tooltipHeight - 5;
                
                // Adjust if tooltip goes off screen or overlaps with legend
                if (tooltipX < 10) tooltipX = 10;
                if (tooltipX + tooltipWidth > width - 10) tooltipX = width - tooltipWidth - 10;
                
                // Check if tooltip would overlap with legend (right side of chart)
                const legendArea = width - 150; // Legend starts at width - 150
                if (tooltipX + tooltipWidth > legendArea - 10) {
                    tooltipX = legendArea - tooltipWidth - 10;
                }
                
                // If tooltip would go above the chart, position it below the point
                if (tooltipY < 10) {
                    tooltipY = y + pointSize + 5;
                }
                
                // Additional check to ensure tooltip doesn't overlap with legend area
                if (tooltipY < 120) { // Legend area extends down to about y=120 now
                    tooltipY = 120 + 5; // Position below legend area
                }
                
                // Draw tooltip background
                scatterCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                scatterCtx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
                
                // Draw tooltip border
                scatterCtx.strokeStyle = '#4a5568';
                scatterCtx.lineWidth = 1;
                scatterCtx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
                
                // Draw tooltip text
                scatterCtx.fillStyle = '#2d3748';
                tooltipLines.forEach((line, index) => {
                    const textY = tooltipY + tooltipPadding + (index + 1) * lineHeight - 4;
                    scatterCtx.fillText(line, x, textY);
                });
            }
        });
    } else {
        // Draw empty state message
        scatterCtx.fillStyle = '#a0aec0';
        scatterCtx.font = '16px Verdana';
        scatterCtx.textAlign = 'center';
        scatterCtx.fillText('Add colleges to see investment vs. return analysis', width / 2, height / 2);
    }
    
    // Draw legend much higher above the graph
    const legendY = 25; // Moved much higher from 50 to 25
    scatterCtx.font = '12px Verdana';
    scatterCtx.textAlign = 'left';
    
    // Mechanical Engineering legend
    scatterCtx.fillStyle = '#3b82f6';
    scatterCtx.fillRect(width - 150, legendY, 12, 12);
    scatterCtx.fillStyle = '#6b46c1';
    scatterCtx.fillText('Mechanical Engineering', width - 130, legendY + 10);
    
    // Biomedical Engineering legend
    scatterCtx.fillStyle = '#ef4444';
    scatterCtx.fillRect(width - 150, legendY + 20, 12, 12);
    scatterCtx.fillStyle = '#6b46c1';
    scatterCtx.fillText('Biomedical Engineering', width - 130, legendY + 30);
}

// Setup event listeners
function setupEventListeners() {
    // User form submission
    document.getElementById('userForm').addEventListener('submit', function(e) {
        e.preventDefault();
        userState = document.getElementById('homeState').value;
        userCity = document.getElementById('homeCity').value;
        
        if (userState && userCity) {
            document.querySelector('.user-info-section').style.opacity = '0.7';
            document.querySelector('.college-selection-section').style.opacity = '1';
            alert(`Location set to ${userCity}, ${userState}! You can now add colleges to your list.`);
        }
    });

    // Program type change
    document.getElementById('programType').addEventListener('change', function() {
        populateCollegeSelect();
    });

    // College selection change
    document.getElementById('collegeSelect').addEventListener('change', function() {
        const selectedValue = this.value;
        const addButton = document.getElementById('addCollegeBtn');
        addButton.disabled = !selectedValue;
    });

    // Add college button
    document.getElementById('addCollegeBtn').addEventListener('click', addCollegeToList);

    // Window resize handler for scatter plot
    window.addEventListener('resize', function() {
        if (scatterCanvas && scatterCtx) {
            const container = scatterCanvas.parentElement;
            scatterCanvas.width = container.offsetWidth - 40;
            scatterCanvas.height = container.offsetHeight - 60;
            drawScatterPlot();
        }
    });
}

// Populate college select dropdown
function populateCollegeSelect() {
    const programType = document.getElementById('programType').value;
    const collegeSelect = document.getElementById('collegeSelect');
    
    // Clear existing options
    collegeSelect.innerHTML = '<option value="">Choose a college...</option>';
    
    if (collegeData[programType]) {
        collegeData[programType].forEach(college => {
            const option = document.createElement('option');
            option.value = college.name;
            option.textContent = college.name;
            collegeSelect.appendChild(option);
        });
    }
    
    // Reset add button
    document.getElementById('addCollegeBtn').disabled = true;
}

// Add college to user's list
async function addCollegeToList() {
    const programType = document.getElementById('programType').value;
    const collegeName = document.getElementById('collegeSelect').value;
    
    if (!collegeName || !userState || !userCity) {
        alert('Please set your location first and select a college.');
        return;
    }
    
    // Find the college data
    const college = collegeData[programType].find(c => c.name === collegeName);
    
    if (!college) {
        alert('College not found.');
        return;
    }
    
    // Check if already in list
    if (selectedColleges.some(c => c.name === collegeName)) {
        alert('This college is already in your list!');
        return;
    }
    
    // Show loading message
    const addButton = document.getElementById('addCollegeBtn');
    const originalText = addButton.textContent;
    addButton.textContent = 'Calculating...';
    addButton.disabled = true;
    
    try {
        // Calculate travel estimates
        const origin = `${userCity}, ${userState}`;
        const destination = `${college.city}, ${college.state}`;
        const travelEstimates = await calculateTravelEstimates(origin, destination);
        
        // Add to selected colleges with travel data
        const collegeWithProgram = {
            ...college,
            programType: programType,
            travelEstimates: travelEstimates
        };
        selectedColleges.push(collegeWithProgram);
        
        // Update UI
        updateCollegeList();
        updateMap();
        updateScatterPlot();
        updateSummary();
        
        // Reset selection
        document.getElementById('collegeSelect').value = '';
        addButton.disabled = true;
        
        // Show success message
        showNotification(`${collegeName} added to your list with travel estimates!`);
        
    } catch (error) {
        console.error('Error adding college:', error);
        alert('Error adding college. Please try again.');
    } finally {
        // Restore button
        addButton.textContent = originalText;
    }
}

// Update the college list display
function updateCollegeList() {
    const collegeList = document.getElementById('collegeList');
    const emptyState = document.querySelector('.empty-state');
    
    if (selectedColleges.length === 0) {
        collegeList.innerHTML = '<p class="empty-state">No colleges added yet. Start by selecting colleges above!</p>';
        return;
    }
    
    // Remove empty state
    if (emptyState) {
        emptyState.remove();
    }
    
    collegeList.innerHTML = '';
    
    selectedColleges.forEach((college, index) => {
        const collegeItem = createCollegeItem(college, index);
        collegeList.appendChild(collegeItem);
    });
}

// Create a college item element
function createCollegeItem(college, index) {
    const item = document.createElement('div');
    item.className = 'college-item';
    
    // Determine if user is in-state
    const isInState = college.state === userState;
    const tuition = isInState ? college.in_state_tuition : college.out_of_state_tuition;
    const totalCost = isInState ? college.in_state_total_cost : college.out_of_state_total_cost;
    
    const programClass = college.programType === 'mechanical_engineering' ? 'mechanical' : 'biomedical';
    const programText = college.programType === 'mechanical_engineering' ? 'Mechanical Engineering' : 'Biomedical Engineering';
    
    // Travel information
    let travelInfo = '';
    if (college.travelEstimates) {
        const driving = college.travelEstimates.driving;
        const flying = college.travelEstimates.flying;
        
        travelInfo = `
            <div class="detail-item">
                <span class="detail-label">🚗 Driving:</span>
                <span class="detail-value">${driving.duration} (${driving.distance}) - $${driving.cost}</span>
            </div>
        `;
        
        if (flying) {
            travelInfo += `
                <div class="detail-item">
                    <span class="detail-label">✈️ Flying:</span>
                    <span class="detail-value">${flying.duration} - $${flying.cost}</span>
                </div>
            `;
        } else {
            travelInfo += `
                <div class="detail-item">
                    <span class="detail-label">✈️ Flying:</span>
                    <span class="detail-value">Too close to fly</span>
                </div>
            `;
        }
    }
    
    item.innerHTML = `
        <div class="college-header">
            <div class="college-name">${college.name}</div>
            <button class="remove-btn" onclick="removeCollege(${index})">×</button>
        </div>
        <div class="program-badge ${programClass}">${programText}</div>
        <div class="college-details">
            <div class="detail-item">
                <span class="detail-label">Location:</span>
                <span class="detail-value">${college.address}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Tuition (${isInState ? 'In-State' : 'Out-of-State'}):</span>
                <span class="detail-value">$${tuition.toLocaleString()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Total Cost:</span>
                <span class="detail-value">$${totalCost.toLocaleString()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Expected Earnings:</span>
                <span class="detail-value">$${college.expected_earnings_after_graduation.toLocaleString()}</span>
            </div>
            ${travelInfo}
        </div>
    `;
    
    return item;
}

// Remove college from list
function removeCollege(index) {
    selectedColleges.splice(index, 1);
    updateCollegeList();
    updateMap();
    updateScatterPlot();
    updateSummary();
    
    if (selectedColleges.length === 0) {
        document.getElementById('listSummary').style.display = 'none';
    }
}

// Update the map with college markers
function updateMap() {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    if (selectedColleges.length === 0) {
        // Reset map view to US
        map.setView([39.8283, -98.5795], 4);
        return;
    }
    
    // Add markers for each college
    const bounds = L.latLngBounds();
    
    selectedColleges.forEach(college => {
        const color = college.programType === 'mechanical_engineering' ? '#4299e1' : '#f56565';
        
        const marker = L.circleMarker([college.latitude, college.longitude], {
            radius: 8,
            fillColor: color,
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        // Add popup
        const popupContent = `
            <div style="text-align: center;">
                <strong>${college.name}</strong><br>
                ${college.programType === 'mechanical_engineering' ? 'Mechanical Engineering' : 'Biomedical Engineering'}<br>
                ${college.address}
            </div>
        `;
        marker.bindPopup(popupContent);
        
        markers.push(marker);
        bounds.extend([college.latitude, college.longitude]);
    });
    
    // Fit map to show all markers
    map.fitBounds(bounds, { padding: [20, 20] });
}

// Update scatter plot
function updateScatterPlot() {
    if (!scatterCanvas || !scatterCtx) {
        console.warn('Scatter plot not available, skipping update');
        return;
    }
    
    drawScatterPlot();
}

// Update summary statistics
function updateSummary() {
    if (selectedColleges.length === 0) {
        document.getElementById('listSummary').style.display = 'none';
        return;
    }
    
    const isInState = selectedColleges[0].state === userState;
    const totalTuition = selectedColleges.reduce((sum, college) => {
        return sum + (isInState ? college.in_state_tuition : college.out_of_state_tuition);
    }, 0);
    
    const totalCost = selectedColleges.reduce((sum, college) => {
        return sum + (isInState ? college.in_state_total_cost : college.out_of_state_total_cost);
    }, 0);
    
    const avgTuition = Math.round(totalTuition / selectedColleges.length);
    const avgTotalCost = Math.round(totalCost / selectedColleges.length);
    
    document.getElementById('totalColleges').textContent = selectedColleges.length;
    document.getElementById('avgTuition').textContent = `$${avgTuition.toLocaleString()}`;
    document.getElementById('avgTotalCost').textContent = `$${avgTotalCost.toLocaleString()}`;
    
    document.getElementById('listSummary').style.display = 'block';
}

// Show notification
function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    
    // Set styles based on type
    if (type === 'location') {
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
            z-index: 1000;
            font-size: 0.9rem;
            font-weight: 600;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 350px;
            font-family: 'Verdana', Geneva, sans-serif;
        `;
    } else {
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
            z-index: 1000;
            font-weight: 600;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            font-family: 'Verdana', Geneva, sans-serif;
        `;
    }
    
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after appropriate time
    const duration = type === 'location' ? 4000 : 3000;
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, duration);
}

// Utility function to format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}