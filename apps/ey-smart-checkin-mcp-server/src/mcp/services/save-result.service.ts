import { Injectable } from '@nestjs/common';

@Injectable()
export class SaveResultService {
  async save(operation: string, result: number): Promise<unknown> {
    // 🔒 HARD-CODED POST API DETAILS
    const URL = 'https://api.example.com/results';
    const HEADERS = {
      'content-type': 'application/json',
      authorization: 'Bearer HARD_CODED_TOKEN',
    };

    const res = await fetch(URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ operation, result }),
    });

    const text = await res.text();

    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }

    return {
      ok: res.ok,
      status: res.status,
      body,
    };
  }
}
