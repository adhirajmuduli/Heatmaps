import os
import io
import base64 
import logging
from quart import Quart, jsonify, request, send_file, render_template, session
from quart import send_from_directory 
from werkzeug.utils import secure_filename
import pandas as pd
import numpy as np
import logging
from scipy.ndimage import gaussian_filter
import geopandas as gpd
from sklearn.neighbors import KernelDensity
from PIL import Image, ImageDraw
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from matplotlib.patches import PathPatch
from matplotlib.path import Path
from matplotlib.colorbar import ColorbarBase
import matplotlib.cm
from routes.data_api import bp as data_api_bp
import tracemalloc
tracemalloc.start()

# --- Basic Setup -----------------------------------------------------------------

app = Quart(__name__)
app.register_blueprint(data_api_bp)
app.config['SECRET_KEY'] = os.urandom(24)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Helper Functions ------------------------------------------------------------

def allowed_file(filename: str) -> bool:
    """Checks if the file extension is in the allowed list."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def clean_and_validate_data(df: pd.DataFrame) -> (pd.DataFrame, str):
    """Standardizes column names, types, and validates required data."""
    df.columns = df.columns.str.strip().str.lower()
    
    # Check for required latitude and longitude columns
    required_cols = {'latitude', 'longitude'}
    if not required_cols.issubset(df.columns):
        return None, f"Missing required columns. Found: {list(df.columns)}, Required: {list(required_cols)}"

    # Convert lat/lon to numeric
    for col in ['latitude', 'longitude']:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    # Drop rows with invalid coordinates
    df = df[df['latitude'].between(-90, 90) & df['longitude'].between(-180, 180)]
    
    try:
        # Handle the new format where data is already in long format (latitude, longitude, timestamp, value, species)
        if 'value' in df.columns and 'timestamp' in df.columns:
            # Convert value column to numeric
            df['value'] = pd.to_numeric(df['value'], errors='coerce')
            
            # Drop rows with invalid values
            df = df.dropna(subset=['value', 'latitude', 'longitude'])
            
            if df.empty:
                return None, "No valid data points found after processing."
            
            # Ensure species column exists
            if 'species' not in df.columns:
                df['species'] = 'UploadedParameter'
            
            return df, None
        else:
            return None, "Expected 'value' and 'timestamp' columns in processed data."
    
    except Exception as e:
        logging.error(f"Error processing data: {e}", exc_info=True)
        return None, f"Error processing data: {str(e)}"

# --- Core Routes -----------------------------------------------------------------

@app.route('/')
async def index():
    """Serves the main HTML page of the application."""
    return await render_template('index.html')

from quart import send_from_directory

@app.route('/static/data/export.geojson')
async def serve_geojson():
    return await send_from_directory('static/data', 'export.geojson', mimetype='application/json')

@app.route('/upload', methods=['POST'])
async def upload_data():
    """Handles file upload, cleaning, validation, and returns data and stats."""
    print("\n=== UPLOAD REQUEST RECEIVED ===")
    
    form = await request.form
    files = await request.files

    print(f"Form data: {form}")
    print(f"Files received: {files}")
    
    try:
        # Check if the post request has the file part
        if 'file' not in files:
            print("ERROR: No file part in request")
            return jsonify({'error': 'No file part in the request'}), 400
            
        file = files['file']
        print(f"Processing file: {file.filename}")
        
        # If user does not select file, browser also
        # submit an empty part without filename
        if file.filename == '':
            print("ERROR: No file selected")
            return jsonify({'error': 'No selected file'}), 400
            
        if not file or not allowed_file(file.filename):
            print(f"ERROR: Invalid file type: {file.filename}")
            return jsonify({'error': 'File type not allowed. Please upload a CSV or Excel file.'}), 400
            
        print(f"File type allowed: {file.filename}")

        try:
            print("\n=== READING FILE ===")
            # Read the file into a pandas DataFrame
            try:
                if file.filename.lower().endswith(('.xls', '.xlsx')):
                    print("Reading Excel file...")
                    df = pd.read_excel(file)
                else:
                    print("Reading CSV file...")
                    df = pd.read_csv(file)
                
                print(f"Successfully read file with shape: {df.shape}")
                print(f"Columns: {df.columns.tolist()}")
                if len(df) > 0:
                    print("First few rows:")
                    print(df.head(2).to_string())
                
            except Exception as read_error:
                print(f"ERROR reading file: {str(read_error)}")
                return jsonify({
                    'error': f'Error reading file: {str(read_error)}',
                    'type': 'file_read_error'
                }), 400
            
            # Handle wide format data (first two columns are lat/lon, rest are timestamps)
            if len(df.columns) > 2:
                print("Converting wide format to long format...")
                # First two columns are lat/lon, rest are timestamps
                lat_col = df.columns[0]
                lon_col = df.columns[1]
                timestamp_cols = df.columns[2:]
                
                # Rename first two columns to standard names
                df = df.rename(columns={
                    lat_col: 'latitude',
                    lon_col: 'longitude'
                })
                
                # Melt the DataFrame to long format
                df_long = df.melt(
                    id_vars=['latitude', 'longitude'],
                    value_vars=timestamp_cols,
                    var_name='timestamp',
                    value_name='value'
                )
                # Use original column headers (as-is) as timestamps
                df_long['timestamp'] = df_long['timestamp'].astype(str)

                # Optional: sort timestamps for slider, but keep original labels
                try:
                    stats_timestamps = sorted(
                        df_long['timestamp'].unique(),
                        key=lambda x: pd.to_datetime(x, errors='coerce') if pd.to_datetime(x, errors='coerce') is not pd.NaT else x
                    )
                except:
                    stats_timestamps = sorted(df_long['timestamp'].unique())

                # Add species column
                df_long['species'] = 'UploadedParameter'
                
                # Convert value to numeric
                df_long['value'] = pd.to_numeric(df_long['value'], errors='coerce')
                
                # Drop rows with missing values
                df = df_long.dropna(subset=['latitude', 'longitude', 'value'])
                
                print(f"Converted to long format. New shape: {df.shape}")
                if len(df) > 0:
                    print("First few rows after conversion:")
                    print(df.head(2).to_string())
            
            # Ensure required columns exist
            if 'species' not in df.columns:
                df['species'] = 'observation'
                
            # Ensure value column exists (for long format input)
            if 'value' not in df.columns and 'count' in df.columns:
                df = df.rename(columns={'count': 'value'})

            print("\n=== VALIDATING DATA ===")
            # Process and validate the data
            try:
                df_clean, error = clean_and_validate_data(df)
                if error:
                    print(f"Data validation failed: {error}")
                    return jsonify({
                        'error': f'Data validation error: {error}',
                        'type': 'validation_error'
                    }), 400
                    
                if df_clean is None or df_clean.empty:
                    print("No valid data found after cleaning")
                    return jsonify({
                        'error': 'No valid data found in the file',
                        'type': 'no_valid_data'
                    }), 400
                
                print(f"Data validation successful. Cleaned data shape: {df_clean.shape}")
                
            except Exception as validation_error:
                print(f"ERROR during validation: {str(validation_error)}")
                return jsonify({
                    'error': f'Error during data validation: {str(validation_error)}',
                    'type': 'validation_exception'
                }), 400
            
            # Log some info about the processed data
            logging.info(f"Processed {len(df_clean)} rows of data")
            logging.info(f"Columns in cleaned data: {df_clean.columns.tolist()}")
            
            # Prepare response
            stats = {
                'total_points': len(df_clean),
                'species_count': df_clean['species'].nunique() if 'species' in df_clean else 0,
                'timestamps': stats_timestamps
            }

            # Compute global min and max from the cleaned data's 'value' column

            # Ensure we're not trying to return too much data
            sample_data = df_clean.head(1000).to_dict(orient='records')  # Limit to first 1000 rows

            global_min = df_clean['value'].min()
            global_max = df_clean['value'].max()

            response_data = {
                'message': f'Successfully processed {len(df_clean)} data points',
                'data': sample_data,
                'stats': stats,
                'total_records': len(df_clean),
                'global_min': float(global_min),
                'global_max': float(global_max),
                'timestamp_columns': stats['timestamps']
            }

            return jsonify(response_data), 200
            
        except Exception as e:
            logging.error(f"Error processing file: {str(e)}", exc_info=True)
            return jsonify({
                'error': f'Error processing file: {str(e)}',
                'details': str(e)
            }), 500
            
    except Exception as e:
        logging.error(f"Unexpected error in upload handler: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'An unexpected error occurred while processing your request',
            'details': str(e) if str(e) else 'No additional details available'
        }), 500

from matplotlib.path import Path

def polygon_to_path(polygon):
    """Converts shapely Polygon or MultiPolygon to matplotlib Path objects."""
    if polygon.is_empty:
        return []
    paths = []
    polygons = [polygon] if polygon.geom_type == 'Polygon' else polygon.geoms
    for poly in polygons:
        vertices = list(poly.exterior.coords)
        codes = [Path.MOVETO] + [Path.LINETO] * (len(vertices) - 1)
        for interior in poly.interiors:
            vertices.extend(list(interior.coords))
            codes.extend([Path.MOVETO] + [Path.LINETO] * (len(interior.coords) - 1))
        paths.append(Path(vertices, codes))
    return paths

@app.route('/generate-heatmap', methods=['POST'])
async def generate_heatmap():
    """Generates a correctly aspected and masked heatmap using matplotlib."""
    try:
        # Try to get JSON data first, fall back to form data if that fails
        try:
            payload = await request.get_json(force=True)  # ✅ FIXED

            if 'global_min' not in payload or 'global_max' not in payload:
                logging.warning("Global min/max not provided in payload, calculating from data")
                all_values = [float(point['value']) for point in payload['data']]
                global_min = min(all_values)
                global_max = max(all_values)
            else:
                global_min = float(payload['global_min'])
                global_max = float(payload['global_max'])

            if not payload or 'data' not in payload:
                return jsonify({'error': 'Invalid request data'}), 400

        except Exception as e:
            logging.error(f"Error processing JSON data: {str(e)}", exc_info=True)
            return jsonify({'error': 'Invalid JSON data format'}), 400

        if not payload or 'data' not in payload:
            return jsonify({'error': 'No data provided in the request.'}), 400

        bandwidth_km = max(float(payload.get('bandwidth', 0.05)), 0.05)
        data_records = payload['data']
        
        df = pd.DataFrame(data_records)
        if df.empty:
            return jsonify({'error': 'Data is empty after processing.'}), 400

        timestamps = payload.get('timestamp_columns') or [payload.get('timestamp')]

        if not timestamps:
            return jsonify({'error': 'No timestamps provided'}), 400

        timestamp = timestamps[0]
        if not timestamp or 'timestamp' not in df.columns:
            return jsonify({'error': 'Missing timestamp field in data'}), 400

        from shapely.geometry import Polygon
        # Lagoon boundary
        lake_boundary = gpd.read_file('static/data/export.geojson').geometry.iloc[0]
        min_lon, min_lat, max_lon, max_lat = lake_boundary.bounds

        # Rectangle polygon from bounding box
        rect_poly = Polygon([
            (85.389862, 19.858694),
            (85.624695, 19.858694),
            (85.624695, 19.942627),
            (85.389862, 19.942627)
        ])
        # Intersection: lagoon ∩ rectangle
        intersection_poly = lake_boundary.intersection(rect_poly)
        # Lagoon minus rectangle: lagoon - rectangle
        lagoon_minus_rect = lake_boundary.difference(rect_poly)

        # Create a square grid for density estimation
        grid_res = 400
        grid_lon = np.linspace(min_lon, max_lon, grid_res)
        grid_lat = np.linspace(min_lat, max_lat, grid_res)
        grid_x, grid_y = np.meshgrid(grid_lon, grid_lat)
        grid_points = np.vstack([grid_x.ravel(), grid_y.ravel()]).T

        results = {}

        print(f"[INFO] Generating {len(timestamps)} heatmaps...")

        timestamps = timestamps [:1] # TEMP: Only process first 2 for test

        for ts in timestamps:
            df_filtered = df[df['timestamp'] == ts]
            print(f"→ Processing timestamp: {ts} with {len(df_filtered)} points...")
            print(f"→ Global min/max: {global_min}, {global_max}")
            print(f"→ Bandwidth: {bandwidth_km} km")

            if df_filtered.empty:
                continue

            df_agg = df_filtered.groupby(['latitude', 'longitude'])['value'].mean().reset_index()

            coords = df_agg[['longitude', 'latitude']].to_numpy()
            weights = df_agg['value'].to_numpy()

            norm_min = global_min
            norm_max = global_max

            # Convert bandwidth from km to degrees
            bandwidth_deg = bandwidth_km / 111.0
            # Ensure weights are clipped to global range
            weights = np.clip(weights, norm_min, norm_max)

            # --- IDW Interpolation ---
            def idw_interpolate(coords, values, grid_points, power=2):
                """Inverse Distance Weighted interpolation on a grid."""
                interpolated = np.zeros(len(grid_points))
                for i, gp in enumerate(grid_points):
                    dists = np.linalg.norm(coords - gp, axis=1)
                    # Avoid division by zero
                    dists[dists == 0] = 1e-12
                    weights = 1 / (dists ** power)
                    interpolated[i] = np.sum(weights * values) / np.sum(weights)
                return interpolated

            # Run IDW
            interpolated_values = idw_interpolate(coords, weights, grid_points)

            interpolated_grid = interpolated_values.reshape(grid_res, grid_res)
            interpolated_grid = gaussian_filter(interpolated_grid, sigma=4.5)

            # Use the global min/max from payload for normalization
            interpolated_grid = np.clip(interpolated_grid, global_min, global_max)

            sample_vals = interpolated_grid.flatten()
            print("Sample interpolated values:", np.round(np.sort(sample_vals)[-10:], 2))

            # Tight bounding box from lagoon bounds
            extent = (min_lon, max_lon, min_lat, max_lat)

            aspect_ratio = (max_lon - min_lon) / (max_lat - min_lat)
            fig_width = 6
            fig_height = fig_width / aspect_ratio
            fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=150)  # Lower DPI avoids Leaflet pixel distortion
            fig.patch.set_alpha(0)
            ax.patch.set_alpha(0)
            ax.set_xlim(min_lon, max_lon)
            ax.set_ylim(min_lat, max_lat)
            ax.set_aspect('equal', adjustable='box')  # Prevent distortion across lat-long scaling
            ax.axis('off')
            plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

            # Intersection
            for p in polygon_to_path(intersection_poly):
                patch = PathPatch(p, transform=ax.transData, facecolor='#006400', edgecolor='none', zorder=1)
                ax.add_patch(patch)

            if interpolated_grid.min() < norm_min or interpolated_grid.max() > norm_max:
                logging.warning(f"[WARN] Density values outside global range for {ts}: min={interpolated_grid.min()}, max={interpolated_grid.max()}")

            norm = Normalize(vmin=global_min, vmax=global_max)
            scaled_grid = norm(interpolated_grid)  # values in [0, 1] range

            heatmap_im = ax.imshow(interpolated_grid,
                                cmap=matplotlib.cm.turbo,
                                origin='lower',
                                extent=extent,
                                interpolation='gaussian',
                                zorder=2,
                                vmin=global_min,
                                vmax=global_max)

            for p in polygon_to_path(lagoon_minus_rect):
                clip_patch = PathPatch(p, transform=ax.transData, facecolor='none', edgecolor='none')
                heatmap_im.set_clip_path(clip_patch)

            # 🔻 Encode to base64 inside loop
            buf = io.BytesIO()
            fig.savefig(buf,
                        format='PNG',
                        dpi=150,
                        bbox_inches='tight',
                        pad_inches=0,
                        transparent=True)
            plt.close(fig)
            buf.seek(0)
            results[ts] = base64.b64encode(buf.read()).decode('utf-8')
        
        # --- End Masking ---
        print(f"Processing heatmap for: {ts} | Points: {len(df_filtered)}") 
        print(f"Global min/max: {norm_min} / {norm_max}")
        print("\n")
        return jsonify({'images':results}), 200

    except Exception as e:
        logging.error(f"Heatmap generation failed: {e}", exc_info=True)
        return jsonify({'error': 'Could not generate heatmap.'}), 500

@app.route('/animate')
async def animation_page():
    return await render_template('animation.html')

# --- Error Handlers --------------------------------------------------------------

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Resource not found.'}), 404

@app.errorhandler(500)
def internal_error(error):
    logging.error(f'Internal Server Error: {error}', exc_info=True)
    return jsonify({'error': 'An internal server error occurred.'}), 500

from routes.animation_api import animation_bp
app.register_blueprint(animation_bp)

@app.route('/legend/<timestamp>.png')
async def serve_legend(timestamp):
    """Generates a vertical colorbar legend image with fixed global scale."""
    try:
        # You can later store these globally if needed
        global_min = float(request.args.get('min', 0))
        global_max = float(request.args.get('max', 1))

        fig, ax = plt.subplots(figsize=(1, 4.8))  # Taller, narrow bar
        fig.patch.set_alpha(0)

        norm = Normalize(vmin=global_min, vmax=global_max)
        cbar = ColorbarBase(
            ax,
            cmap=matplotlib.cm.turbo,
            norm=norm,
            orientation='vertical'
        )
        cbar.ax.tick_params(labelsize=10, width=1, length=4)
        tick_values = np.round(np.linspace(global_min, global_max, 7), 2)
        cbar.set_ticks(tick_values)
        cbar.set_ticklabels([f"{v:.2f}" for v in tick_values])
        cbar.ax.tick_params(labelsize=8)

        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=200, bbox_inches='tight', transparent=True, pad_inches=0)
        plt.close(fig)
        buf.seek(0)
        return await send_file(buf, mimetype='image/png')

    except Exception as e:
        logging.error(f"Legend generation failed: {e}", exc_info=True)
        return jsonify({'error': 'Could not generate legend'}), 500

# --- Main Execution --------------------------------------------------------------

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
