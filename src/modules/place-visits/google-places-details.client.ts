import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

export type GooglePlaceDetailsResult = {
  googlePlaceId: string;
  name: string | null;
  latitude: number;
  longitude: number;
  primaryType: string | null;
  city: string | null;
};

/**
 * Cliente mínimo Place Details (New).
 * Env: GOOGLE_PLACES_API_KEY (servidor; independiente de Android).
 */
@Injectable()
export class GooglePlacesDetailsClient {
  private readonly logger = new Logger(GooglePlacesDetailsClient.name);
  private readonly endpointBase = 'https://places.googleapis.com/v1/places';

  private apiKey(): string | undefined {
    const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
    return key || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async fetchPlaceDetails(googlePlaceId: string): Promise<GooglePlaceDetailsResult> {
    const key = this.apiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'GOOGLE_PLACES_API_KEY no configurada en el servidor.',
      );
    }

    const id = googlePlaceId.trim();
    if (!id) {
      throw new ServiceUnavailableException('googlePlaceId vacío.');
    }

    const url = `${this.endpointBase}/${encodeURIComponent(id)}`;
    // Field mask mínimo: sin photos/ratings/reviews.
    const fieldMask =
      'id,displayName,location,primaryType,formattedAddress,addressComponents';

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
      },
    });

    if (res.status === 404 || res.status === 400) {
      this.logger.warn(`Place Details no encontrado: ${id} (${res.status})`);
      throw new ServiceUnavailableException('Lugar de Google Places no encontrado.');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Place Details error ${res.status}: ${body.slice(0, 200)}`);
      throw new ServiceUnavailableException(
        'No se pudo resolver el establecimiento con Google Places.',
      );
    }

    const json = (await res.json()) as {
      id?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
      primaryType?: string;
      formattedAddress?: string;
      addressComponents?: Array<{
        longText?: string;
        types?: string[];
      }>;
    };

    const lat = json.location?.latitude;
    const lng = json.location?.longitude;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      throw new ServiceUnavailableException(
        'Google Places no devolvió coordenadas utilizables.',
      );
    }

    const city =
      json.addressComponents?.find((c) =>
        c.types?.includes('locality'),
      )?.longText ??
      json.addressComponents?.find((c) =>
        c.types?.includes('administrative_area_level_2'),
      )?.longText ??
      null;

    return {
      googlePlaceId: json.id ?? id,
      name: json.displayName?.text ?? null,
      latitude: lat,
      longitude: lng,
      primaryType: json.primaryType ?? null,
      city,
    };
  }
}
