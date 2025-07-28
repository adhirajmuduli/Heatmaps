class HeatmapApp {
    constructor() {
        this.state = {
            file: null,
            map: null,
            lakeBoundary: null,
            heatmapLayer: null,
            viewMode: 'markers', // 'markers' or 'heatmap'
            markers: [],
            lastData: null,
            globalMin: 0,
            globalMax: 1,
            timestampToData: {},
            blackDotMarkers: [],
            hot: null, // Handsontable instance
            dates: [], // array of ISO date strings for slider
            heatmapLayers: {},         // timestamp -> L.ImageOverlay
            timestampOrder: [],        // to track order
            currentIndex: 0,           // index into timestampOrder[]
        };

        this.dom = {
            fileInput: document.getElementById('file-input'),
            fileLabel: document.querySelector('.file-label'),
            fileName: document.getElementById('file-name'),
            uploadButton: document.getElementById('upload-button'),
            generateButton: document.getElementById('generate-button'),
            bandwidthSlider: document.getElementById('bandwidth-slider'),
            bandwidthValue: document.getElementById('bandwidth-value'),
            opacitySlider: document.getElementById('opacity-slider'),
            opacityValue: document.getElementById('opacity-value'),
            statusContainer: document.getElementById('status-container'),
            loadingOverlay: document.getElementById('loading-overlay'),
            mapContainer: document.getElementById('map'),
            viewMarkersBtn: document.getElementById('view-markers-btn'),
            viewHeatmapBtn: document.getElementById('view-heatmap-btn'),
            dataEntryContainer: document.getElementById('data-entry-container'),
            loadDataButton: document.getElementById('load-data-button'),
            openDataEntryBtn: document.getElementById('open-data-entry'),
            paramSelect: document.getElementById('param-select'),
            showBlackDotsCheckbox: document.getElementById('show-black-dots-checkbox'),
            navPrev: document.getElementById('nav-prev'),
            navNext: document.getElementById('nav-next'),
            tileContainer: document.getElementById('heatmap-gallery'),
        };

        this.init();
    }

    init() {
        this.initMap();
        this.addEventListeners();
        this.dom.generateButton.disabled = true;
        this.initHandsontable();
        this.dom.bandwidthValue.textContent = this.dom.bandwidthSlider.value;
        this.dom.opacityValue.textContent = this.dom.opacitySlider.value; 

        // No longer fetch parameter selectors; uploads are single-parameter, multi-timestamp only.
    }

    // Removed: parameter selector logic. All uploads are single-parameter, multi-timestamp only.

    initMap() {
        const DownloadControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: (map) => {
                const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
                btn.innerHTML = '⬇';
                btn.title = 'Download Map Snapshot';
                btn.style.width = '34px';
                btn.style.height = '34px';
                btn.style.fontSize = '20px';
                btn.style.lineHeight = '30px';
                btn.style.background = '#fff';
                btn.style.border = 'none';
                btn.style.cursor = 'pointer';
    
                L.DomEvent.disableClickPropagation(btn);
                L.DomEvent.on(btn, 'click', L.DomEvent.stop);
                L.DomEvent.on(btn, 'click', () => {
                    this.downloadMapSnapshot();
                });
    
                return btn;
            }
        });
    
        this.state.map = L.map(this.dom.mapContainer, {
            center: [19.67, 85.33],
            zoom: 10,
            scrollWheelZoom: false,
        });
    
        this.state.map.addControl(new DownloadControl());
    
        this.loadLakeBoundary().catch(err => {
            console.warn('Fallback to blank map:', err);
            this.showStatus('Lake boundary failed to load. Map will be shown without boundary.', 'error');

            const fallbackCoords = [
                [19.63, 85.30],
                [19.63, 85.36],
                [19.71, 85.36],
                [19.71, 85.30]
            ];
        
            this.state.lakeBoundary = L.polygon(fallbackCoords, {
                color: '#000',
                fillOpacity: 0.1
            }).addTo(this.state.map);
        
            this.state.map.fitBounds(this.state.lakeBoundary.getBounds());
        
            this.state.map.setView([19.67, 85.33], 10); // fallback center if boundary fails
        });

        const CopyControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: (map) => {
                const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
                btn.innerHTML = '📋';
                btn.title = 'Copy Map to Clipboard';
                btn.style.width = '34px';
                btn.style.height = '34px';
                btn.style.fontSize = '20px';
                btn.style.lineHeight = '30px';
                btn.style.background = '#fff';
                btn.style.border = 'none';
                btn.style.cursor = 'pointer';
        
                L.DomEvent.disableClickPropagation(btn);
                L.DomEvent.on(btn, 'click', L.DomEvent.stop);
                L.DomEvent.on(btn, 'click', () => {
                    this.copyMapToClipboard();
                });
        
                return btn;
            }
        });
        this.state.map.addControl(new CopyControl());
        
    }
    

    initHandsontable() {
        if (!this.dom.dataEntryContainer || !window.Handsontable) return;
        this.state.hot = new Handsontable(this.dom.dataEntryContainer, {
            data: Array(15).fill(['', '', '', '']),
            colHeaders: ['latitude', 'longitude', 'count', 'species'],
            columns: [
                { type: 'numeric', numericFormat: { pattern: '0.[000000]' } },
                { type: 'numeric', numericFormat: { pattern: '0.[000000]' } },
                { type: 'numeric', numericFormat: { pattern: '0' } },
                { type: 'text' }
            ],
            stretchH: 'all',
            height: 300,
            rowHeaders: true,
            licenseKey: 'non-commercial-and-evaluation'
        });
    }

    async loadLakeBoundary() {
        try {
            const response = await fetch('/static/data/export.geojson');
            if (!response.ok) {
                console.error('❌ Failed to fetch export.geojson:', response.statusText);
                throw new Error('Network response was not ok.');
            }
            const contentType = response.headers.get('content-type');
            if (!contentType.includes('application/json')) {
                console.warn('⚠️ export.geojson served with incorrect content-type:', contentType);
            }
            const geojsonData = await response.json();
            console.log('✅ Parsed GeoJSON:', geojsonData);
       
            console.log('✅ Loaded lake boundary:', geojsonData);

            // Create a visible boundary with blue color
            this.state.lakeBoundary = L.geoJSON(geojsonData, {
                style: { 
                    color: "#000000",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.1
                }
            }).addTo(this.state.map);
            console.log('✅ lakeBoundary layer added:', this.state.lakeBoundary);

            const bounds = this.state.lakeBoundary?.getBounds?.() ?? L.latLngBounds([[19.63, 85.30], [19.71, 85.36]]);
            console.log('Bounds:', bounds);
            if (bounds.isValid() && !bounds.getNorthEast().equals(bounds.getSouthWest())) {
                this.state.map.fitBounds(bounds);
                this.state.map.setMaxBounds(bounds.pad(0.2));
                this.state.map.setMinZoom(this.state.map.getBoundsZoom(bounds));
            } else {
                console.warn('⚠️ Invalid or zero-size boundary, skipping fitBounds.');
                this.state.map.setView([19.67, 85.33], 10);
            }            

        } catch (error) {
            console.error('Error loading lake boundary:', error);
            this.showStatus('Could not load lake boundary.', 'error');
            this.dom.generateButton.disabled = false;
        }
        setTimeout(() => this.state.map.invalidateSize(), 100);
    }

    addEventListeners() {
        this.dom.uploadButton.addEventListener('click', () => this.uploadFile());
        this.dom.generateButton.addEventListener('click', () => this.generateHeatmap());
        this.dom.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.dom.bandwidthSlider.addEventListener('input', () => {
            this.dom.bandwidthValue.textContent = this.dom.bandwidthSlider.value;
            this.liveUpdateHeatmap();
        });
        this.dom.opacitySlider.addEventListener('input', () => {
            this.dom.opacityValue.textContent = this.dom.opacitySlider.value;
            this.liveUpdateHeatmap();
        });        
        this.dom.viewMarkersBtn.addEventListener('click', () => this.setViewMode('markers'));
        this.dom.viewHeatmapBtn.addEventListener('click', () => this.setViewMode('heatmap'));
        this.dom.openDataEntryBtn.addEventListener('click', () => {
            window.open('/data-entry', '_blank');
        });

        this.dom.showBlackDotsCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.showBlackDots();
            } else {
                this.clearBlackDots();
            }
        });
        this.dom.navPrev.addEventListener('click', () => {
            const count = this.state.timestampOrder.length;
            this.state.currentIndex = (this.state.currentIndex - 1 + count) % count;
            this.showHeatmapAt(this.state.currentIndex);
        });
        this.dom.navNext.addEventListener('click', () => {
            const count = this.state.timestampOrder.length;
            this.state.currentIndex = (this.state.currentIndex + 1) % count;
            this.showHeatmapAt(this.state.currentIndex);
                 
        });

        // Event delegation for deleting measurements from map popups
        this.state.map.on('click', (e) => {
            if (e.originalEvent.target.classList.contains('btn-delete-measurement')) {
                const button = e.originalEvent.target;
                this.deleteMeasurement(button.dataset);
            }
        });

        // Drag and drop file handling
        const dropArea = this.dom.fileLabel;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
        });

        dropArea.addEventListener('drop', (e) => {
            this.handleFileSelect(e);
        }, false);
    }

    async fetchSlice() {
        const param = this.dom.paramSelect.value;
        const date = this.state.dates[idx];
        if (!date) return;
        if (!param || !date) return;
        const url = `/api/table?param=${encodeURIComponent(param)}&date=${encodeURIComponent(date)}`;
        const res = await fetch(url);
        if (!res.ok) { this.showStatus('Failed to fetch slice','error'); return; }
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length===0){ this.showStatus('No data for selection','error'); return; }
        // convert rows to generic format expected
        const data = rows.map(r=>({ latitude: r.latitude, longitude: r.longitude, count: r.value??1, species: r.parameter }));
        this.state.lastData = { data };
        this.displayMarkers(data);
        this.dom.generateButton.disabled = false;
        this.showStatus(`${data.length} points for ${param} @ ${date}`,'success');
    }

    loadTableData() {
        if (!this.state.hot) return;
        const rawData = this.state.hot.getData();
        const data = [];
        for (const row of rawData) {
            const [lat, lon, count, species] = row;
            if (lat === '' || lon === '') continue; // skip empty rows
            const latitude = parseFloat(lat);
            const longitude = parseFloat(lon);
            const cnt = count === '' || count === null ? 1 : parseInt(count, 10);
            const sp = species || 'Unknown';
            if (isNaN(latitude) || isNaN(longitude)) {
                this.showStatus('Invalid latitude or longitude in table.', 'error');
                return;
            }
            data.push({ latitude, longitude, count: cnt || 1, species: sp });
        }

        if (data.length === 0) {
            this.showStatus('No valid rows found in table.', 'error');
            return;
        }

        // set lastData and enable generate button
        this.state.lastData = { data };
        this.showStatus(`${data.length} data points loaded from table.`, 'success');
        this.dom.generateButton.disabled = false;

        // show markers immediately for feedback
        this.displayMarkers(data);
    }
    liveUpdateHeatmap() {
        if (this.state.viewMode !== 'heatmap') return;
        const opacity = parseFloat(this.dom.opacitySlider.value);
        const layer = this.state.heatmapLayer;
        if (layer) {
            layer.setOpacity(opacity);
        }
    }    

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.state.file = file;
            this.dom.fileName.textContent = file.name;
            this.dom.uploadButton.disabled = false;
            this.showStatus(`Selected file: ${file.name}`, 'info');
        }
    }

    async uploadFile() {
        if (!this.state.file) {
            this.showStatus('No file selected', 'error');
            return;
        }

        this.showLoading(true, 'Uploading and processing file...');

        const formData = new FormData();
        formData.append('file', this.state.file);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            // First check if the response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text);
                throw new Error('Server returned an invalid response. Please try again.');
            }

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Upload failed with status ${response.status}`);
            }

            if (!result.data || !Array.isArray(result.data)) {
                console.error('Invalid data format received:', result);
                throw new Error('Invalid data format received from server');
            }

            this.state.lastData = result; // Store full response
            this.state.globalMin = result.global_min;
            this.state.globalMax = result.global_max;

            if (this.state.globalMin === undefined || this.state.globalMax === undefined) {
                const allValues = this.state.lastData.data.map(p => parseFloat(p.value)).filter(v => !isNaN(v));
                this.state.globalMin = Math.min(...allValues);
                this.state.globalMax = Math.max(...allValues);
            }            

            // fallback if backend doesn't send it
            if (this.state.globalMin === undefined || this.state.globalMax === undefined) {
                const allValues = result.data.map(p => p.value).filter(v => typeof v === 'number');
                this.state.globalMin = Math.min(...allValues);
                this.state.globalMax = Math.max(...allValues);
            }

            if (result.global_min !== undefined && result.global_max !== undefined) {
                // Convert to numbers explicitly
                this.state.globalMin = Number(result.global_min);
                this.state.globalMax = Number(result.global_max);
            } else {
                // Comprehensive fallback calculation
                const allValues = result.data.map(p => {
                    const val = parseFloat(p.value);
                    return isNaN(val) ? null : val;
                }).filter(v => v !== null);
                
                if (allValues.length > 0) {
                    this.state.globalMin = Math.min(...allValues);
                    this.state.globalMax = Math.max(...allValues);
                } else {
                    // Ultimate fallback if no valid values found
                    this.state.globalMin = 0;
                    this.state.globalMax = 1;
                }
            }
            
            console.log('Stored global min/max:', 
                this.state.globalMin, this.state.globalMax); 

            this.state.timestampToData = {};  // map timestamp -> list of points
            result.data.forEach(point => {
                const ts = point.timestamp;
                if (!this.state.timestampToData[ts]) {
                    this.state.timestampToData[ts] = [];
                }
                this.state.timestampToData[ts].push(point);
            });

            const tileContainer = document.getElementById('heatmap-gallery');
            tileContainer.innerHTML = ''; // clear previous

            if (result.global_min !== undefined && result.global_max !== undefined) {
                this.state.globalMin = result.global_min;
                this.state.globalMax = result.global_max;
            } else {
                // Fallback calculation if backend doesn't provide values
                const allValues = result.data.map(p => p.value).filter(v => typeof v === 'number');
                this.state.globalMin = Math.min(...allValues);
                this.state.globalMax = Math.max(...allValues);
            }

            if (Array.isArray(result.timestamp_columns)) {
                result.timestamp_columns.forEach(ts => {
                    const tile = document.createElement('div');
                    tile.className = 'heatmap-tile';
                    tile.textContent = ts;
                    tile.dataset.timestamp = ts;

                    tile.addEventListener('click', () => {
                        console.log('✅ Clicked heatmap tile for', ts); 
                        const i = this.state.timestampOrder.indexOf(ts);
                        if (i !== -1) {
                            this.state.currentIndex = i;
                            this.showHeatmapAt(i);
                        }
                    });                    

                    tileContainer.appendChild(tile);
                });
            }

            if (typeof this.state.globalMin !== 'number' || typeof this.state.globalMax !== 'number') {
                this.state.globalMin = 0;
                this.state.globalMax = 1;
            }            

            this.showStatus(`Successfully processed ${result.data.length} data points.`, 'success');
            this.dom.generateButton.disabled = false;
            
            this.displayMarkers(result.data);

        } catch (error) {
            console.error('Upload error:', error);
            let errorMessage = error.message || 'An unknown error occurred';
            
            // Handle specific error cases
            if (error.message.includes('Unexpected token') || 
                error.message.includes('JSON.parse')) {
                errorMessage = 'Invalid server response. The file might be in an incorrect format.';
            } else if (error.message.includes('NetworkError')) {
                errorMessage = 'Network error. Please check your connection and try again.';
            }
            
            this.showStatus(`Error: ${errorMessage}`, 'error');
            this.dom.generateButton.disabled = true;
        } finally {
            this.showLoading(false);
        }
    }

    async generateHeatmap() {
        this.clearBlackDots();
        if (!this.state.lastData?.data) {
            this.showStatus('Please upload a file first.', 'error');
            return;
        }
    
        this.showLoading(true, 'Generating heatmaps...');
    
        try {
            console.log('✅ Calling /generate-heatmap with payload:', {
                timestamps: this.state.lastData.timestamp_columns,
                dataLength: this.state.lastData.data.length
            });     
            
            const payload = {
                data: this.state.lastData.data,
                bandwidth: parseFloat(this.dom.bandwidthSlider.value),
                opacity: parseFloat(this.dom.opacitySlider.value),
                timestamp_columns: this.state.lastData.timestamp_columns,
                global_min: this.state.globalMin,
                global_max: this.state.globalMax
            };
            
            console.log('Sending heatmap with global min/max:', 
                this.state.globalMin, this.state.globalMax);            
            
            const response = await fetch('/generate-heatmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: this.state.lastData.data,
                    bandwidth: parseFloat(this.dom.bandwidthSlider.value),
                    opacity: parseFloat(this.dom.opacitySlider.value),
                    timestamp_columns: this.state.lastData.timestamp_columns,
                    global_min: this.state.globalMin,
                    global_max: this.state.globalMax
                })
            });
    
            if (!response.ok) throw new Error('Heatmap generation failed.');
            
            const result = await response.json();

            const images = result.images;  // ✅ properly extract image set

            if (!images || Object.keys(images).length === 0) {
                this.showStatus("No heatmap images returned from server", "error");
                return;
            }

            // ❌ Remove existing layers first
            Object.values(this.state.heatmapLayers).forEach(layer => {
                if (this.state.map.hasLayer(layer)) {
                    this.state.map.removeLayer(layer);
                }
            });

            this.state.globalMin = result.global_min;
            this.state.globalMax = result.global_max;

            this.state.heatmapLayers = {};
            this.state.timestampOrder = Object.keys(images);
            this.state.currentIndex = 0;
            this.dom.tileContainer.innerHTML = '';

            this.state.timestampOrder.forEach((ts, idx) => {
                const base64 = images[ts];
                const url = 'data:image/png;base64,' + base64;

                if (!this.state.map.getPane('heatmapPane')) {
                    this.state.map.createPane('heatmapPane');
                    this.state.map.getPane('heatmapPane').style.zIndex = 200;  // Below blackDots
                }                

                const bounds = this.state.lakeBoundary?.getBounds?.() ?? L.latLngBounds([[19.63, 85.30], [19.71, 85.36]]);
                const overlay = L.imageOverlay(url, bounds, {
                    opacity: idx === 0 ? parseFloat(this.dom.opacitySlider.value) : 0,
                    pane: 'heatmapPane'
                });
                overlay.setZIndex(200);
                overlay.addTo(this.state.map);
                this.state.heatmapLayers[ts] = overlay;

                if (idx === 0) {
                    this.state.heatmapLayer = overlay;
                }

                const tile = document.createElement('div');
                tile.className = 'heatmap-tile';
                tile.textContent = ts;
                tile.dataset.timestamp = ts;

                tile.addEventListener('click', () => {
                    const i = this.state.timestampOrder.indexOf(ts);
                    if (i !== -1) {
                        this.state.currentIndex = i;
                        this.showHeatmapAt(i);
                    }
                });

                this.dom.tileContainer.appendChild(tile);
            });

            this.highlightActiveTile(this.state.timestampOrder[0]);
            this.setViewMode('heatmap');

            this.state.blackDotMarkers.forEach(marker => {
                marker.remove();
            });

            // Also display matching red markers
            this.showHeatmapAt(0);  // Handles layer swap, marker display, legend update

            this.showStatus('Heatmaps generated successfully.', 'success');
            this.displayMarkers(this.state.lastData);  // Restore red-scaled data markers

        } catch (err) {
            this.showStatus('Error: ' + err.message, 'error');
        } finally {
            this.showLoading(false);
        }
        

    }
    
    showHeatmapAt(index) {
    
        const ts = this.state.timestampOrder[index];
        const layer = this.state.heatmapLayers[ts];

        if (this.state.heatmapLayer && this.state.map.hasLayer(this.state.heatmapLayer)) {
            this.state.map.removeLayer(this.state.heatmapLayer);
        }        
    
        if (layer) {
            layer.setOpacity(parseFloat(this.dom.opacitySlider.value));
            layer.addTo(this.state.map);
            console.log('✅ Overlay added to map for', ts);
            this.state.currentIndex = index;
            this.state.heatmapLayer = layer;
            this.highlightActiveTile(ts);
            this.setViewMode('heatmap');

            // ✅ Also update the colorbar legend image (vertical)
            this.updateLegend(ts);

            const fallbackMin = typeof this.state.globalMin === 'number' ? this.state.globalMin : 0;
            const fallbackMax = typeof this.state.globalMax === 'number' ? this.state.globalMax : 1;
            document.getElementById("legend-min").textContent = fallbackMin.toFixed(2);
            document.getElementById("legend-max").textContent = fallbackMax.toFixed(2);

        }        
    }    

    updateLegend(timestamp) {

        const minLabel = document.getElementById('legend-min');
        const maxLabel = document.getElementById('legend-max');
        const legendImg = document.getElementById("legend-image");

        const safeMin = typeof this.state.globalMin === 'number' ? this.state.globalMin : 0;
        const safeMax = typeof this.state.globalMax === 'number' ? this.state.globalMax : 1;

        const fallbackMin = Number.isFinite(this.state.globalMin) ? this.state.globalMin : 0;
        const fallbackMax = Number.isFinite(this.state.globalMax) ? this.state.globalMax : 1;

        if (minLabel && maxLabel) {
            minLabel.textContent = fallbackMin.toFixed(2);
            maxLabel.textContent = fallbackMax.toFixed(2);
        }

        if (legendImg) {
            const legendUrl = `/legend/${timestamp}.png?min=${safeMin}&max=${safeMax}`;
            legendImg.src = legendUrl;
            console.log(`[Legend] Updating image for ${timestamp}: ${legendUrl}`);
        } else {
            console.warn("⚠️ Legend image element not found.");
        }

        document.getElementById("legend-min").textContent = fallbackMin.toFixed(2);
        document.getElementById("legend-max").textContent = fallbackMax.toFixed(2);

        minLabel.textContent = safeMin.toFixed(2);
        maxLabel.textContent = safeMax.toFixed(2);
        const legendUrl = `/legend/${timestamp}.png?min=${safeMin}&max=${safeMax}`;
        console.log(`[Legend] Updating image for ${timestamp}: ${legendUrl}`);

        
        if (legendImg) {
            legendImg.src = legendUrl;
        } else {
            console.warn("⚠️ Legend image element not found.");
        }
    
        
    }
    
    
    highlightActiveTile(timestamp) {
        const tiles = document.querySelectorAll('.heatmap-tile');
        tiles.forEach(tile => {
            tile.classList.remove('active');
            if (tile.dataset.timestamp === timestamp) {
                tile.classList.add('active');
            }
        });
    }
    
    setViewMode(mode) {
        this.state.viewMode = mode;
        
        const isMarkerMode = mode === 'markers';
        
        this.dom.viewMarkersBtn.classList.toggle('active', isMarkerMode);
        this.dom.viewHeatmapBtn.classList.toggle('active', !isMarkerMode);
        
        // Toggle marker visibility
        this.state.markers.forEach(marker => {
            const isVisible = mode === 'markers';
            marker.setStyle({
                opacity: isVisible ? 1 : 0,
                fillOpacity: isVisible ? 0.8 : 0
            });
        });
    
        // Toggle heatmap visibility
        if (this.state.heatmapLayer) {
            const heatmapOpacity = isMarkerMode ? 0 : parseFloat(this.dom.opacitySlider.value);
            this.state.heatmapLayer.setOpacity(heatmapOpacity);
        }
    
        // Ensure boundary is always on top
        if (this.state.lakeBoundary) {
            this.state.lakeBoundary.bringToFront();
        }
    
        // 🧠 NEW LOGIC: When switching to marker mode, show timestamp-specific markers
        if (isMarkerMode) {
            const ts = this.state.timestampOrder[this.state.currentIndex];
        
            // ✅ Fallback: use all markers if timestamp-specific markers not found
            let markerData = this.state.timestampToData?.[ts];
            if (!markerData || markerData.length === 0) {
                console.warn(`⚠️ No data found for timestamp ${ts}, falling back to lastData`);
                markerData = this.state.lastData?.data || [];
            }
            this.displayMarkers({ data: markerData });
        }        
    }

    displayMarkers(data) {
        this.clearMarkers();
        if (!data || !data.data) return;

        const points = data.data;

        // Create a scale function for marker radius
        const radiusScale = (count) => {
            const counts = points.map(p => p.value || 1);
            const maxCount = this.state.globalMax || 1;
            return 5 + 15 * ((count - 1) / (maxCount > 1 ? maxCount - 1 : 1));
        };

        points.forEach(point => {
            if (point.latitude && point.longitude) {
                const radius = radiusScale(point.value || 1);

                if (!this.state.map.getPane('markerPane')) {
                    this.state.map.createPane('markerPane');
                    this.state.map.getPane('markerPane').style.zIndex = 500;
                }                

                const marker = L.circleMarker([point.latitude, point.longitude], {
                    radius: radius,
                    pane: 'markerPane',
                    color: '#a90000',
                    fillColor: '#a90000',
                    fillOpacity: 1,
                    weight: 1,
                    stroke: false
                }).addTo(this.state.map);

                const popupContent = `
                    <b>Latitude:</b> ${point.latitude.toFixed(4)}<br/>
                    <b>Longitude:</b> ${point.longitude.toFixed(4)}<br/>
                    <b>Parameter:</b> ${point.parameter}<br/>
                    <b>Timestamp:</b> ${point.timestamp}<br/>
                    <b>Value:</b> ${point.value}<br/>
                    <button class="delete-measurement-btn button button-danger" 
                            data-latitude="${point.latitude}" 
                            data-longitude="${point.longitude}" 
                            data-parameter="${point.parameter}" 
                            data-timestamp="${point.timestamp}"
                            style="margin-top: 10px;">Delete</button>
                `;

                marker.bindPopup(popupContent);

                marker.on('popupopen', () => {
                    const deleteBtn = document.querySelector('.delete-measurement-btn');
                    if (deleteBtn) {
                        deleteBtn.onclick = (e) => {
                            const lat = parseFloat(e.target.dataset.latitude);
                            const lon = parseFloat(e.target.dataset.longitude);
                            const param = e.target.dataset.parameter;
                            const ts = e.target.dataset.timestamp;
                            this.deleteMeasurement({ latitude: lat, longitude: lon, parameter: param, timestamp: ts });
                        };
                    }
                });

                this.state.markers.push(marker);
            }
        });
        console.log(`Value ${point.value} → normalized: ${(point.value - this.state.globalMin) / (this.state.globalMax - this.state.globalMin)}`);
        
        //this.setViewMode('markers'); // Ensure markers are visible after being added
    }

    clearMarkers() {
        this.state.markers.forEach(marker => this.state.map.removeLayer(marker));
        this.state.markers = [];
    }

    showBlackDots() {
        if (!this.state.lastData || !this.state.lastData.data) return;
        this.clearBlackDots();
        const points = this.state.lastData.data;
        points.forEach(pt => {
            const marker = L.circleMarker([pt.latitude, pt.longitude], {
                radius: 4,
                color: '#000',
                fillColor: '#000',
                fillOpacity: 1,
                weight: 1
            }).addTo(this.state.map);
            this.state.blackDotMarkers.push(marker);
        });
    }

    clearBlackDots() {
        this.state.blackDotMarkers.forEach(m => this.state.map.removeLayer(m));
        this.state.blackDotMarkers = [];
    }

    async deleteMeasurement(details) {
        const { latitude, longitude, parameter, timestamp } = details;
        
        if (!confirm(`Are you sure you want to delete the measurement for '${parameter}' at this location?`)) {
            return;
        }

        this.showLoading(true, 'Deleting...');

        try {
            const response = await fetch('/api/measurement', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude, longitude, parameter, timestamp })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete measurement.');
            }

            this.showStatus('Measurement deleted successfully.', 'success');
            this.state.map.closePopup();
            
            // Refresh the data for the current view to reflect the deletion
            this.fetchSlice();

        } catch (error) {
            console.error('Deletion error:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    downloadMapSnapshot() {
        this.showStatus('Preparing map snapshot...', 'info');

        // Set a white background on the map container itself for the snapshot
        const mapContainer = this.dom.mapContainer;
        // Temporarily override map background for snapshot
        const originalBg = mapContainer.style.backgroundColor;
        mapContainer.style.backgroundColor = '#ffffff'; // or '#e0f7fa'

        if (typeof leafletImage !== 'function') {
            console.error('leafletImage is not loaded or not a function');
            this.showStatus('Snapshot library not available. Try reloading.', 'error');
            return;
        }        

        // The 'idle' event ensures all tiles and overlays are loaded.
        this.state.map.once('idle', () => {
            setTimeout(() => {
                leafletImage(this.state.map, (err, canvas) => {
                    mapContainer.style.backgroundColor = '';
        
                    if (err) {
                        console.error('Snapshot failed during rendering:', err);
                        this.showStatus('Could not create map snapshot. Please try again.', 'error');
                        return;
                    }
        
                    if (canvas.width === 0 || canvas.height === 0) {
                        this.showStatus('Snapshot failed: the created image was blank.', 'error');
                        return;
                    }
        
                    try {
                        const link = document.createElement('a');
                        link.download = 'chilika_map_snapshot.png';
                        link.href = canvas.toDataURL('image/png');
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        this.showStatus('Snapshot downloaded successfully!', 'success');
                    } catch (e) {
                        console.error('Failed to save the snapshot:', e);
                        this.showStatus('Could not save the snapshot image.', 'error');
                    }
                });
            }, 100); // delay to allow heatmap image overlays to render
        });        

        // Trigger a re-render to ensure the 'idle' event will fire.
        this.state.map.invalidateSize();
    }

    showStatus(message, type = 'info') {
        this.dom.statusContainer.textContent = message;
        this.dom.statusContainer.className = 'status-container'; // Reset classes
        this.dom.statusContainer.classList.add(type);
    }

    showLoading(isLoading, message = 'Loading...') {
        if (isLoading) {
            this.dom.loadingOverlay.querySelector('p').textContent = message;
            this.dom.loadingOverlay.style.display = 'flex';
        } else {
            this.dom.loadingOverlay.style.display = 'none';
        }
        this.dom.uploadButton.disabled = isLoading;
        this.dom.generateButton.disabled = isLoading || !this.state.lastData;
    }

    async copyMapToClipboard() {
        this.showStatus('Preparing map for clipboard...', 'info');
    
        const mapContainer = this.dom.mapContainer;
        const originalBg = mapContainer.style.backgroundColor;
        mapContainer.style.backgroundColor = '#ffffff';
    
        if (typeof leafletImage !== 'function') {
            console.error('leafletImage is not loaded or not a function');
            this.showStatus('Snapshot library not available.', 'error');
            return;
        }

        if (!navigator.clipboard || !window.ClipboardItem) {
            this.showStatus('Clipboard API not supported in this browser.', 'error');
            mapContainer.style.backgroundColor = originalBg;  // restore background
            return;
        }
    
        this.state.map.once('idle', () => {
            setTimeout(() => {
                leafletImage(this.state.map, async (err, canvas) => {
                    mapContainer.style.backgroundColor = originalBg;
    
                    if (err || !canvas) {
                        this.showStatus('Failed to render map for clipboard.', 'error');
                        return;
                    }
    
                    try {
                        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                        if (!blob) {
                            throw new Error("Blob generation failed.");
                        }
    
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
    
                        this.showStatus('Map copied! Paste into Word, Gmail, etc. (Paint may not support this).', 'success');
                        console.info('✅ You can now paste the map (Ctrl+V) into Word, Gmail, or any app supporting image pasting.');
                    } catch (e) {
                        console.error('Clipboard error:', e);
                        this.showStatus('Could not copy map to clipboard. Browser may not support this.', 'error');
                    }
                });
            }, 100);
        });
    
        this.state.map.invalidateSize();
    }
    
}

document.addEventListener('DOMContentLoaded', () => new HeatmapApp());