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

function jsonResponse(data: unknown, status = 200) {
  return corsResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
}

function isValidDate(dateStr: string): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (!iso) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export default {
  async fetch(request: Request, env: any) {
    try {
      const url = new URL(request.url);
      const method = request.method;

      if (method === 'OPTIONS') {
        return corsResponse(null, { status: 204 });
      }

      // GET — fetch loco tracking record by train_number + startDate, or search locos
      if (method === 'GET') {
        const trainNumber = url.searchParams.get('train_number');
        const startDateParam = url.searchParams.get('startDate');
        const search = url.searchParams.get('search') || url.searchParams.get('q'); // support ?search= or ?q=

        // If search is provided, we do loco search
        if (search !== null) {
          let results;
          if (search.trim() === '') {
            // Empty search: return the 10 most recent locos overall
            results = await env.DB.prepare(
              `SELECT loco_number, train_number, MAX(startDate) as startDate 
               FROM loco_tracking 
               GROUP BY loco_number 
               ORDER BY startDate DESC 
               LIMIT 10`
            ).all();
          } else {
            // Search locos matching the query
            results = await env.DB.prepare(
              `SELECT loco_number, train_number, MAX(startDate) as startDate 
               FROM loco_tracking 
               WHERE loco_number LIKE ? 
               GROUP BY loco_number 
               ORDER BY startDate DESC 
               LIMIT 10`
            ).bind(`${search}%`).all();
          }
          return jsonResponse({ results: results.results }, 200);
        }

        // Original logic for specific train_number
        if (!trainNumber) {
          return jsonResponse({ error: 'Missing train_number query parameter' }, 400);
        }

        let result;

        if (startDateParam) {
          // Validate the date format
          if (!isValidDate(startDateParam)) {
            return jsonResponse({ error: 'Invalid startDate format. Expected YYYY-MM-DD' }, 400);
          }
          // Fetch for specific train + date combo
          result = await env.DB.prepare(
            `SELECT * FROM loco_tracking WHERE train_number = ? AND startDate = ?`
          ).bind(trainNumber, startDateParam).first();
        } else {
          // No date provided — return the most recent entry for this train
          result = await env.DB.prepare(
            `SELECT * FROM loco_tracking WHERE train_number = ? ORDER BY startDate DESC LIMIT 1`
          ).bind(trainNumber).first();
        }

        // Return null (not 404) when no record exists — lets client distinguish "no data" from errors
        if (!result) {
          return jsonResponse(null, 200);
        }

        return jsonResponse(result, 200);
      }

      // POST — insert or replace loco tracking record
      if (method === 'POST') {
        const trainNumber = url.searchParams.get('train_number');
        const locoNumber = url.searchParams.get('loco_number');
        const startDateParam = url.searchParams.get('startDate');
        const userIdentifier =
          url.searchParams.get('user_identifier') ||
          request.headers.get('cf-connecting-ip') ||
          'unknown';

        if (!trainNumber || !locoNumber) {
          return jsonResponse(
            { error: 'Missing required parameters: train_number and loco_number are required' },
            400
          );
        }

        // Validate startDate if provided; otherwise default to today (UTC)
        let startDate: string;
        if (startDateParam) {
          if (!isValidDate(startDateParam)) {
            return jsonResponse(
              { error: 'Invalid startDate format. Expected YYYY-MM-DD (e.g. 2026-05-27)' },
              400
            );
          }
          startDate = startDateParam;
        } else {
          startDate = getTodayUTC();
        }

        await env.DB.prepare(
          `INSERT OR REPLACE INTO loco_tracking (train_number, startDate, loco_number, user_identifier, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(trainNumber, startDate, locoNumber, userIdentifier, new Date().toISOString()).run();

        return jsonResponse({
          success: true,
          message: 'Loco number saved successfully',
          saved_data: {
            train_number: trainNumber,
            loco_number: locoNumber,
            startDate,
            user_identifier: userIdentifier,
          },
        }, 200);
      }

      return jsonResponse({ error: 'Method Not Allowed' }, 405);
    } catch (error: any) {
      return jsonResponse({ error: error.message }, 500);
    }
  },
};
