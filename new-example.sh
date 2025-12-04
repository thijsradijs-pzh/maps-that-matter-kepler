#!/bin/bash
# Helper script to create a new Kepler.gl example

echo "🗺️  Create New Kepler.gl Example"
echo "================================"
echo ""

# Get example name
read -p "Enter example name (e.g., 'age-distribution'): " example_name

# Validate name
if [ -z "$example_name" ]; then
    echo "❌ Error: Example name cannot be empty"
    exit 1
fi

if [ -d "$example_name" ]; then
    echo "❌ Error: Example '$example_name' already exists"
    exit 1
fi

# Get data file
echo ""
echo "Data file options:"
echo "1) Use existing data/subset.csv"
echo "2) I'll add a new data file"
read -p "Choose [1-2]: " data_choice

if [ "$data_choice" = "1" ]; then
    data_file="../data/subset.csv"
    echo "✅ Using data/subset.csv"
else
    read -p "Enter data filename (e.g., 'my-data.csv'): " new_data
    data_file="../data/$new_data"
    echo "⚠️  Remember to add $new_data to the data/ directory!"
fi

# Get config file
echo ""
read -p "Enter config filename (e.g., 'my-config.json'): " config_file
config_path="../config/$config_file"

# Get dataset ID
echo ""
echo "ℹ️  The dataset ID must match the 'dataId' in your Kepler.gl config"
read -p "Enter dataset ID (check your config JSON): " dataset_id

# Get label
echo ""
read -p "Enter display label (e.g., 'My Awesome Map'): " label

# Create directory
mkdir -p "$example_name"

# Create index.html
cat > "$example_name/index.html" << EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>$label – Maps That Matter</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Uber font -->
    <link
      rel="stylesheet"
      href="https://d1a3f4spazzrp4.cloudfront.net/kepler.gl/uber-fonts/4.0.0/superfine.css"
    />

    <!-- Mapbox CSS (for basemap & controls) -->
    <link
      rel="stylesheet"
      href="https://api.tiles.mapbox.com/mapbox-gl-js/v1.1.1/mapbox-gl.css"
    />

    <!-- React / Redux / styled-components from CDN -->
    <script src="https://unpkg.com/react@16.8.4/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@16.8.4/umd/react-dom.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/redux@3.7.2/dist/redux.js" crossorigin></script>
    <script src="https://unpkg.com/react-redux@7.1.3/dist/react-redux.min.js" crossorigin></script>
    <script src="https://unpkg.com/styled-components@4.1.3/dist/styled-components.min.js" crossorigin></script>

    <!-- Kepler.gl UMD build -->
    <script src="https://unpkg.com/kepler.gl@2.4.0/umd/keplergl.min.js"></script>

    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        height: 100%;
        width: 100%;
      }

      #app {
        height: 100vh;
        width: 100vw;
      }

      /* Loading indicator */
      #loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'ff-clan-web-pro', 'Helvetica Neue', Helvetica, sans-serif;
        color: #fff;
        font-size: 18px;
        z-index: 1000;
        text-align: center;
      }

      .spinner {
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 3px solid #fff;
        width: 40px;
        height: 40px;
        margin: 0 auto 10px;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>

    <script>
      const MAPBOX_TOKEN = ""; // Using Carto basemap, no token needed
    </script>
  </head>
  <body>
    <div id="loading">
      <div class="spinner"></div>
      Loading map...
    </div>
    <div id="app"></div>

    <script>
      // --- CONFIGURATION ---
      const CONFIG = {
        dataFile: '$data_file',
        configFile: '$config_path',
        datasetId: '$dataset_id',  // Must match dataId in your Kepler config!
        datasetLabel: '$label'
      };

      // --- REDUX STORE SETUP ---
      const reducers = Redux.combineReducers({
        keplerGl: KeplerGl.keplerGlReducer
      });

      const middlewares = KeplerGl.enhanceReduxMiddleware([]);
      const store = Redux.createStore(
        reducers,
        {},
        Redux.compose(Redux.applyMiddleware(...middlewares))
      );

      // --- REACT COMPONENT THAT RENDERS KEPLER ---
      function KeplerWrapper() {
        return React.createElement(
          "div",
          {
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: "100vw",
              height: "100vh"
            }
          },
          React.createElement(KeplerGl.KeplerGl, {
            id: "map",
            mapboxApiAccessToken: MAPBOX_TOKEN,
            width: window.innerWidth,
            height: window.innerHeight
          })
        );
      }

      const app = React.createElement(
        ReactRedux.Provider,
        { store },
        React.createElement(KeplerWrapper, null)
      );

      ReactDOM.render(app, document.getElementById("app"));

      // --- AUTO-LOAD DATA + CONFIG ---
      const addDataToMap =
        (KeplerGl.actions && KeplerGl.actions.addDataToMap) ||
        KeplerGl.addDataToMap;

      const processors = KeplerGl.processors || {};
      const processCsvData = processors.processCsvData;

      async function loadDataAndConfig() {
        try {
          // Load data file
          const dataResponse = await fetch(CONFIG.dataFile);
          if (!dataResponse.ok) {
            throw new Error(\`Failed to load data: \${dataResponse.statusText}\`);
          }
          const csvText = await dataResponse.text();

          // Load config file
          const configResponse = await fetch(CONFIG.configFile);
          if (!configResponse.ok) {
            throw new Error(\`Failed to load config: \${configResponse.statusText}\`);
          }
          const configJson = await configResponse.json();

          // Process and dispatch data
          const dataset = {
            data: processCsvData(csvText),
            info: {
              id: CONFIG.datasetId,
              label: CONFIG.datasetLabel
            }
          };

          store.dispatch(
            addDataToMap({
              datasets: dataset,
              options: {
                centerMap: true,
                readOnly: false
              },
              config: configJson.config || configJson
            })
          );

          // Hide loading indicator
          document.getElementById('loading').style.display = 'none';
        } catch (err) {
          console.error("Error loading data or config for Kepler map:", err);
          document.getElementById('loading').innerHTML = 
            \`<div style="color: #ff6b6b;">
              <strong>Error loading map</strong><br/>
              \${err.message}
            </div>\`;
        }
      }

      loadDataAndConfig();
    </script>
  </body>
</html>
EOF

echo ""
echo "✅ Created example: $example_name"
echo ""
echo "📝 Next steps:"
echo "1. Add your config to: config/$config_file"
if [ "$data_choice" != "1" ]; then
    echo "2. Add your data to: data/$new_data"
fi
echo "3. Test locally by opening $example_name/index.html"
echo "4. Deploy: ./deploy.sh"
echo ""
echo "🔗 Will be accessible at: https://maps.mapsthatmatter.io/$example_name"
