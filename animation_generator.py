import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt
import imageio
import io
from scipy.interpolate import Rbf, interp1d
from PIL import Image
from db import get_db_session, Measurement, Station, Parameter
from sqlalchemy import select

LAKE_BOUNDARY_GEOJSON = 'static/data/export.geojson'

async def fetch_data_for_animation(parameter: str, start_date, end_date):
    """Fetches measurement data from the database for a given parameter and date range."""
    async with get_db_session() as session:
        stmt = (
            select(Station.latitude, Station.longitude, Measurement.sampled_at, Measurement.value)
            .join(Measurement, Measurement.station_id == Station.id)
            .join(Parameter, Parameter.id == Measurement.parameter_id)
            .where(Parameter.name == parameter)
            .where(Measurement.sampled_at >= start_date)
            .where(Measurement.sampled_at <= end_date)
            .order_by(Measurement.sampled_at)
        )
        result = await session.execute(stmt)
        rows = result.all()
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows, columns=["latitude", "longitude", "sampled_at", "value"])

def generate_spatiotemporal_video(df: pd.DataFrame, fps: int, frames_per_transition: int, cmap: str) -> bytes:
    """Generates a spatiotemporally interpolated video from measurement data."""
    if df.empty:
        raise ValueError("Input DataFrame is empty.")

    df['sampled_at'] = pd.to_datetime(df['sampled_at'])
    unique_dates = sorted(df['sampled_at'].unique())

    if len(unique_dates) < 2:
        raise ValueError("At least two distinct timestamps are required for animation.")

    # --- 1. Spatial Interpolation (RBF) for each time slice ---
    lake_boundary = gpd.read_file(LAKE_BOUNDARY_GEOJSON).geometry.iloc[0]
    min_lon, min_lat, max_lon, max_lat = lake_boundary.bounds
    grid_x, grid_y = np.mgrid[min_lon:max_lon:300j, min_lat:max_lat:300j]

    spatial_fields = []
    for date in unique_dates:
        slice_df = df[df['sampled_at'] == date]
        if slice_df.shape[0] < 4: # RBF needs a minimum number of points
            continue
        
        rbf_interpolator = Rbf(slice_df['longitude'], slice_df['latitude'], slice_df['value'], function='cubic')
        field = rbf_interpolator(grid_x, grid_y)
        spatial_fields.append(field)

    if len(spatial_fields) < 2:
        raise ValueError("Could not generate enough spatial fields for interpolation.")

    # --- 2. Temporal Interpolation (Cubic Spline) between fields ---
    spatial_fields = np.array(spatial_fields)
    time_points = np.arange(len(spatial_fields))
    total_frames = (len(spatial_fields) - 1) * frames_per_transition
    interpolated_time_points = np.linspace(0, len(spatial_fields) - 1, total_frames)

    # Create a cubic interpolator for each pixel in the grid
    interpolator = interp1d(time_points, spatial_fields, axis=0, kind='cubic')
    interpolated_fields = interpolator(interpolated_time_points)

    # --- 3. Render Frames ---
    video_frames = []
    norm = plt.Normalize(vmin=df['value'].min(), vmax=df['value'].max())
    
    for field in interpolated_fields:
        fig, ax = plt.subplots(figsize=(8, 8), dpi=100)
        ax.set_axis_off()
        ax.imshow(field.T, extent=(min_lon, max_lon, min_lat, max_lat), origin='lower', cmap=cmap, norm=norm)
        
        # Clip to lake boundary
        patch = plt.Polygon(lake_boundary.exterior.coords, transform=ax.transData)
        ax.images[0].set_clip_path(patch)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0)
        plt.close(fig)
        buf.seek(0)
        video_frames.append(Image.open(buf))

    # --- 4. Encode Video ---
    with io.BytesIO() as video_buffer:
        imageio.mimsave(video_buffer, video_frames, format='mp4', fps=fps)
        video_bytes = video_buffer.getvalue()

    return video_bytes
