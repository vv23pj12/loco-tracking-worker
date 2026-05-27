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

function isValidDate(dateStr: string): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (!iso) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export default {
  async fetch(request: Request, env: any) {
    try {
      const url = new URL(request.url);
      const method = request.method;

      if (method === 'OPTIONS') {
        return corsResponse(null, { status: 204 });
      }

      // GET — fetch loco tracking record by train_number
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

      // POST — insert or replace loco tracking record
      if (method === 'POST') {
        const trainNumber    = url.searchParams.get('train_number');
        const locoNumber     = url.searchParams.get('loco_number');
        const startDateParam = url.searchParams.get('startDate');
        const userIdentifier =
          url.searchParams.get('user_identifier') ||
          request.headers.get('cf-connecting-ip') ||
          'unknown';

        if (!trainNumber || !locoNumber) {
          return corsResponse(
            'Missing required parameters: train_number and loco_number are required',
            { status: 400 },
          );
        }

        // Validate startDate if provided; otherwise default to today (UTC)
        let startDate: string;
        if (startDateParam) {
          if (!isValidDate(startDateParam)) {
            return corsResponse(
              'Invalid startDate format. Expected YYYY-MM-DD (e.g. 2026-05-27)',
              { status: 400 },
            );
          }
          startDate = startDateParam;
        } else {
          startDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        }

        await env.DB.prepare(`
          INSERT OR REPLACE INTO loco_tracking (train_number, loco_number, user_identifier, startDate)
          VALUES (?, ?, ?, ?)
        `).bind(trainNumber, locoNumber, userIdentifier, startDate).run();

        return corsResponse(
          JSON.stringify({
            success: true,
            message: 'Loco number saved successfully',
            saved_data: {
              train_number:    trainNumber,
              loco_number:     locoNumber,
              user_identifier: userIdentifier,
              startDate,
            },
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
