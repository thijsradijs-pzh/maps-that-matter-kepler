"use client";
import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import KeplerGl from '@kepler.gl/components';
import { addDataToMap } from '@kepler.gl/actions';
import Processors from '@kepler.gl/processors';

export default function AgroMap() {
  const dispatch = useDispatch();

  const loadInitialData = async () => {
    try {
      const response = await fetch('/api/agro');
      const data = await response.json();

      dispatch(
        addDataToMap({
          datasets: [{
            info: { label: 'Agricultural Parcels', id: 'agro_parcels' },
            data: Processors.processGeojson(data)
          }],
          options: { centerMap: true, readOnly: false },
          config: {
            visState: {
              layers: [{
                type: 'geojson',
                config: {
                    dataId: 'agro_parcels',
                    label: 'Parcels',
                    color: [30, 150, 190],
                    isVisible: true
                }
              }]
            }
          }
        })
      );
    } catch (e) {
      console.error("Fetch failed", e);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [dispatch]);

  return (
    <div style={{ position: 'absolute', width: '100vw', height: '100vh' }}>
      <KeplerGl
        id="agro-map"
        width={typeof window !== 'undefined' ? window.innerWidth : 1200}
        height={typeof window !== 'undefined' ? window.innerHeight : 800}
        // If you don't provide a Mapbox token, you'll get a clean black/dark background
      />
    </div>
  );
}