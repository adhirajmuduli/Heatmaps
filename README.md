## GREETINGS ARYANS   
GOOD MORNING/ AFTERNOON/ EVENING/ NIGHT.

## PROJECT TITLE
**PENG-WRAPPER**


## INTRODUCTION  
How this free, open source heatmapping tool is meant to help you, and who may use it --  

Environmental monitoring, ecological research, and field-based studies often involve collecting spatially distributed data (e.g., pH, nutrient levels, species abundance) from multiple locations over time. However, visualizing these spatial and temporal variations in a meaningful, georeferenced form usually requires GIS knowledge and tools or complex software environments. This project proposes to mitigate this **knowledge** and **financial gap**. It's an open source tool with minimal-no code expertise needed from the client ( minimal in case you wish to tweak the code to add different color schemes/ smoothing range, else, you are good with no code ).

This Heatmapping application is a lightweight, interactive browser-based tool designed to visualize geospatial environmental data as heatmaps, giving scientific insights. Built using Python (Quart framework) and JavaScript (Leaflet.js), the application allows time-varying control over .csv/ .xlsx/ .dat file type data imports. IT REQUIRES NO PRIOR CODING/ GIS EXPERTISE to be used, and is simple enough to operate locally on your computer if you perform a few simple steps as declared under the section " INPUT FORMAT & REQUIREMENTS TO RUN LOCALLY " afterwards.  

### The core idea behind this project:  
You just create the map of the geographical are you want by either specifying the co-ordinates in a .geojson type file and use it in place of the export.geojson provided for test, or you can simply download the .geojson of the area you want ( say map of BHARAT ) from open source tools like openstreetmap - the process has been in later sections. You just put the co-ordinates of stations from which you collected your data and the data value in the .xlsx/ .csv/ .dat files ( for better understanding of how the data is to be structured, please review the testfile.xlsx provided in this repo ). **AND THAT'S IT** -- you get the heatmaps for multiple timestamps at a single go, and all the data ( divided under different timestamps ) are not treated as unique entries, rather, a continuity. Global min and max values are defined and all heatmaps are color graded according to the legend defined by global min and max, so that you can see the clear trends in geospatial temporal variation by the raw data ( because we use IDW - Inverse Distance Weighing concept ).  

Note: If you want smoother plots than a blob like appearance ( which might be the case if your recorded stations are very far compared to whole map ), you can tweak the sigma value in app.py to greater integers.

This raw data format ( just numerical value entries ), which is the input criteria makes the feature very general and flexible. You don't have to worry that it's valid just for the few paramters I mentioned above, you can just give the numbers without any units and you should be fine with literally anything. -- Although it must be scientific -- as very different min and max values ( like 1 and 100000 ), might not give visually consistent plots.  

### What the Tool Does -

This application allows users to:

  - Upload a GeoJSON boundary file for their study area (e.g., lake, estuary, forest)

  - Upload station-based environmental data in .csv or .xlsx format, with columns for:

       - Latitude

       - Longitude

       - Multiple timestamped variables (e.g., "Jan-24", "Feb-24")

   - Select parameters and timepoints to visualize individual heatmaps

   - Generate interpolated spatial maps using Inverse Distance Weighting (IDW)

   - Apply Gaussian smoothing for cleaner output

   - Normalize data across timestamps globally, ensuring consistent color mapping

   - Overlay maps with station markers and study boundary

   - View data in marker mode or heatmap mode

   - Export individual heatmaps as PNG images

   - (Planned) Animate spatiotemporal changes as MP4 videos

### Scientific Applications - 

This tool can be applied in a wide range of research contexts:

  - Environmental chemistry: Mapping spatial changes in **pH**, **dissolved oxygen (DO)**, **turbidity**, **BOD**, **nitrate**, **phosphate**, **nutrients**, **pollutants**, etc.

  - Ecology: Heatmapping **species density**, **biomass**, **plankton concentration**, **invasive species spread**.

  - Water quality monitoring: Real-time or monthly visualization of pollutants in **lagoons**, **lakes**, **rivers**, **estuaries**,etc.

  - Public health: Mapping microbial or chemical contamination hotspots.

  - Climate-driven studies: Comparing seasonal/annual shifts in parameters across regions.

### Who this tool is for:

Highly suitable for **field researchers**, **environmental chemists**, **ecologists**, and most importantly-- **students** and **freelancers**, **NGOs** or **NPOs**. Can also be used by **developers** as extensions.

### Why should you consider using this tool ?

- For Researchers:

   - No installation, GIS knowledge, or programming needed,

   - Input data in plain .csv/.xlsx format with clear templates,

   - Visualize and communicate spatiotemporal trends quickly,

   - Useful for field reports, teaching, publications.

- For Developers:

   - Built with Python (Quart) for the backend and Leaflet.js for frontend mapping,

   - Uses Matplotlib + NumPy + SciPy for image generation,

   - Can be integrated into other Flask/Quart-based dashboards,

   - Output can be extended into scientific pipelines, dashboards, or Jupyter-based tools.

This project also includes spatiotemporal interpolation of generated heatmaps over time and space to generate an interpolated animated video which is designed to capture the activity between the two timestamps provided, and how exactly the temporal variations **might have** took place over time. NOTE-- this feature has not been tested scientifically, so is not recommended to be used to derive data for academic work/ research publications. However, I encourage it if someone could test it and let us know the results.  
What you would have to do to test it: Suppose you take two measurements - one in Jan and another in March, you may also take some data for Feb, but plot the heatmap for Feb separately- in different excel input. Generate the video interpolation between jan and march w/o- feb, and in the middle of video, find if the heatmap shown is similar to that provided in the heatmap you generated for Feb.  
Likely the results would differ -- because, environmental parameters are always interlinked and cannot be scoped down to isolating and studying each parameter separately.

### Validity of the tool:  
This tool has been developed and used on real time BOD ( Biological Oxygen Demand ) data from Asia's largest Brackish water Lagoon- Chilika Lagoon. You would find the export.geojson file to be co-ordinates data for this lagoon, as well as the provided testfile.xlsx is actual measured BOD across various stations at the lagoon, whose co-ordinates have been provided in the data sheet across the data.  

### Special Thanks

I would like to extend our gratitude towards CDA ( Chilika Development Authority ) and WRTC ( Wetlands Research and Training Centre ), Chilika, for providing the test data and facilities which have played a crucial role in the development of this software. I would also like to thank Dr. Pradipta Ranjan Muduli for his scientific input, support and guidance throughout the process. 

## FEATURES  

### User-Friendly Interface

  - Upload custom GeoJSON boundaries for your study region

  - Accepts CSV or Excel files with station-wise data across multiple time points

  - Clean, responsive web interface built with Leaflet and Bootstrap (no installation required)

  - Toggle between station marker view and spatial heatmap view

  - Parameter and timestamp selectors for interactive data exploration

  - Download high-resolution PNG snapshots of any heatmap

### Scientific & Analytical Capabilities

  - Spatial interpolation using Inverse Distance Weighting (IDW)

  - Optional Gaussian smoothing for clean, blur-reduced output

  - Supports global min–max normalization for color consistency across time

  - Automatically renders vertical legend colorbars using matplotlib

  - Dynamically overlays heatmap images with user-provided boundary masks

  - Station markers (black dots) added on top of all heatmaps for field reference

### Visual Customization

  - Uses the Turbo colormap (Google) for perceptually uniform, high-contrast rendering

  - Adjustable opacity and smoothing (bandwidth) via frontend controls

  - Auto-scaled legends with timestamp-accurate data ranges

  -  Floating legend with min–max values always visible for clarity

### Backend + Code Architecture

  - Backend powered by Python (Quart) — fast, asynchronous, and modular

  - Interpolation, image generation, and masking done using:

    - matplotlib, scipy, numpy, geopandas, and shapely
  - Organized folder structure (routes/, static/, templates/, utils/) for easy extension

  - JS-based UI powered by Leaflet.js, Handsontable.js , and vanilla JS

### Planned / Upcoming Features

  - Export animated MP4 videos showing changes across months

  - Fully editable in-browser tables for raw data management

  - Support for long-format data (parameter/date/value per row)

  - Shapefile (.shp) support in addition to GeoJSON

  - Toggle between IDW and other interpolation schemes (e.g., KDE, Kriging, RBF.)

## WORKFLOW ON THE WEBAPP  

## INPUT FORMAT & REQUIREMENTS TO RUN LOCALLY  

## FOLDER STRUCTURE  
  
Project1/  
├── animations/  
│   └── generate_video.py  
├── routes/  
│   ├── animation_api.py  
│   └── data_api.py  
├── static/  
│   ├── animations/  
│   │   └── routes.py  
│   ├── css/  
│   │   └── style.css  
│   ├── data/  
│   │   └── uploads/  
│   │       └── export.geojson  
│   └── js/  
│       ├── app.js  
│       └── data_entry.js  
├── templates/  
│   ├── animation.html  
│   ├── data-entry.html    
│   └── index.html  
├── utils/  
│   ├── animation_generator.py  
│   ├── animation_worker.py  
│   └── video_generator.py  
├── app.py  
├── db.py  
└── requirements.txt  


## LICENSE  

The project you are viewing is licensed under MIT License- a permissive open-source license that allows anyone to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, **provided that the original copyright and permission notice are included**. You are free to :  

✔️ Use the code for academic or commercial purposes

✔️ Modify and adapt it to your needs

✔️ Distribute it as part of other projects

✔️ Credit the original authors (recommended)

By using this software, you agree to the terms of the license. If you find this tool useful for your report/ research/ academic work or any derivative projects, please consider citing the work as :


## CITATION  
( not available right now, anticipated to be updated by September ).


## INFORMATION ABOUT THE DEVELOPER  

**ADHIRAJ MUDULI**  
S/O- **Rasmi Ranjan Muduli** (M), **Sasmita Muduli** (F).  
School of Biological Sciences,  
National Institute for Science and Educational Research ( NISER ),  
Bhubaneswar, Odisha, India  
ORCID: https://orcid.org/0009-0005-5655-8120  
Email: adhiraj.muduli@niser.ac.in  
Github: https://github.com/adhirajmuduli  
