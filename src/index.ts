export default {
  async fetch(request: Request, env: any) {
    try {
      const url = new URL(request.url);
      const method = request.method;

      // 1. GET Request: Fetch tracking info (e.g., /?train_number=11272)
      if (method === 'GET') {
        const trainNumber = url.searchParams.get('train_number');
        
        if (!trainNumber) {
          return new Response('Missing train_number query parameter', { status: 400 });
        }

        const result = await env.DB.prepare(`
          SELECT * FROM loco_tracking WHERE train_number = ?
        `).bind(trainNumber).first();

        if (!result) {
          return new Response('Train number not found', { status: 404 });
        }

        return Response.json(result);
      }

      // 2. POST Request: Insert/update using URL parameters (e.g., /?train_number=11272&loco_number=52352&user_identifier=ip)
      if (method === 'POST') {
        const trainNumber = url.searchParams.get('train_number');
        const locoNumber = url.searchParams.get('loco_number');
        
        // Automatically fall back to Cloudflare's connecting IP header if user_identifier parameter is omitted
        const userIdentifier = url.searchParams.get('user_identifier') || request.headers.get('cf-connecting-ip') || 'unknown';

        if (!trainNumber || !locoNumber) {
          return new Response('Missing required parameters: train_number and loco_number are required', { status: 400 });
        }

        await env.DB.prepare(`
          INSERT OR REPLACE INTO loco_tracking (train_number, loco_number, user_identifier)
          VALUES (?, ?, ?)
        `).bind(trainNumber, locoNumber, userIdentifier).run();

        return Response.json({ 
          success: true, 
          message: 'Loco number saved successfully',
          saved_data: { train_number: trainNumber, loco_number: locoNumber, user_identifier: userIdentifier }
        });
      }

      return new Response('Method Not Allowed', { status: 405 });

    } catch (error: any) {
      return new Response(error.message, { status: 500 });
    }
  }
};
