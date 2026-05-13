const defaultCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Credentials': 'true',
};

function corsResponse(body: BodyInit | null, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: {
      ...defaultCorsHeaders,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export default {
  async fetch(request: Request, env: any) {
    try {
      const url = new URL(request.url);
      const method = request.method;

      if (method === 'OPTIONS') {
        return corsResponse(null, { status: 204 });
      }

      if (method === 'GET') {
        const trainNumber = url.searchParams.get('train_number');

        if (!trainNumber) {
          return corsResponse('Missing train_number query parameter', { status: 400 });
        }

        const result = await env.DB.prepare(`
          SELECT * FROM loco_tracking WHERE train_number = ?
        `).bind(trainNumber).first();

        if (!result) {
          return corsResponse('Train number not found', { status: 404 });
        }

        return corsResponse(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        });
      }

      if (method === 'POST') {
        const trainNumber = url.searchParams.get('train_number');
        const locoNumber = url.searchParams.get('loco_number');
        const userIdentifier =
          url.searchParams.get('user_identifier') ||
          request.headers.get('cf-connecting-ip') ||
          'unknown';

        if (!trainNumber || !locoNumber) {
          return corsResponse('Missing required parameters: train_number and loco_number are required', {
            status: 400,
          });
        }

        await env.DB.prepare(`
          INSERT OR REPLACE INTO loco_tracking (train_number, loco_number, user_identifier)
          VALUES (?, ?, ?)
        `).bind(trainNumber, locoNumber, userIdentifier).run();

        return corsResponse(
          JSON.stringify({
            success: true,
            message: 'Loco number saved successfully',
            saved_data: { train_number: trainNumber, loco_number: locoNumber, user_identifier: userIdentifier },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } },
        );
      }

      return corsResponse('Method Not Allowed', { status: 405 });
    } catch (error: any) {
      return corsResponse(error.message, { status: 500 });
    }
  },
};
