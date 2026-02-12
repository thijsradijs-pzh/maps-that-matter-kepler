// api/agro-proxy.js
export default async function handler(req, res) {
    const { bbox } = req.query;
    const AGRO_TOKEN = process.env.AGRO_TOKEN; // Set this in Vercel Dashboard

    // Default bbox for Wageningen if none provided
    const area = bbox || "5.65,51.95,5.68,51.98"; 
    const url = `https://agrodatacube.wur.nl/api/v2/rest/fields?bbox=${area}&epsg=4326&output_epsg=4326`;

    try {
        const response = await fetch(url, {
            headers: { 'token': AGRO_TOKEN, 'Accept': 'application/json' }
        });
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from AgroDataCube' });
    }
}