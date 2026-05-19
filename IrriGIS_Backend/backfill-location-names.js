const { Report, sequelize } = require('./models');
const axios = require('axios');

async function backfill() {
  try {
    const reports = await Report.findAll({
      where: {
        location_name: null
      }
    });

    console.log(`Found ${reports.length} reports to backfill.`);

    for (const report of reports) {
      const coords = report.location.coordinates; // [lng, lat]
      const [lng, lat] = coords;

      try {
        console.log(`Reverse geocoding report ${report.id} (${lat}, ${lng})...`);
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
          params: {
            format: 'json',
            lat: lat,
            lon: lng,
            zoom: 18,
            addressdetails: 1
          },
          headers: {
            'User-Agent': 'IrriGIS-App'
          }
        });

        if (response.data && response.data.display_name) {
          const address = response.data.address;
          const locationName = `${address.road || address.suburb || address.neighbourhood || ''}, ${address.city || address.town || address.village || address.county || ''}`.trim().replace(/^, |, $/g, '');
          
          await report.update({ location_name: locationName || response.data.display_name });
          console.log(`Updated report ${report.id} with location: ${locationName}`);
        }

        // Respect Nominatim usage policy (1 request per second)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`Failed to geocode report ${report.id}:`, err.message);
      }
    }

    console.log('Backfill completed.');
  } catch (error) {
    console.error('Backfill error:', error);
  } finally {
    process.exit();
  }
}

backfill();
