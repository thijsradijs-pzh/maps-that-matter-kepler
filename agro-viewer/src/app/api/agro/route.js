import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get('bbox') || "5.6,51.9,5.7,52.0"; // Default to Wageningen area

  const url = `https://agrodatacube.wur.nl/api/v2/rest/fields?bbox=${bbox}&epsg=4326&output_epsg=4326`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'token': process.env.AGRO_TOKEN,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) throw new Error('AgroDataCube API Error');
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}