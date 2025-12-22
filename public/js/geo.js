const STORAGE_KEY = 'geo_last_ok';
const REQUEST_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

class GeoService {
    constructor() {
        this.lastLocation = this.recuperarUltimaLocalizacao();
    }

    recuperarUltimaLocalizacao() {
        try {
            const salvo = sessionStorage.getItem(STORAGE_KEY);
            if (!salvo) return null;
            const parsed = JSON.parse(salvo);
            if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
                return parsed;
            }
        } catch (error) {
            console.warn('Não foi possível ler a localização salva:', error);
        }
        return null;
    }

    salvarLocalizacao(location) {
        this.lastLocation = location;
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(location));
        } catch (error) {
            console.warn('Não foi possível salvar a localização na sessão:', error);
        }
    }

    validarContextoSeguro() {
        if (typeof window === 'undefined') return;
        if (!window.isSecureContext) {
            throw { code: 'INSECURE_CONTEXT', message: 'Acesse via HTTPS para permitir geolocalização.' };
        }
    }

    async getRequiredLocation() {
        this.validarContextoSeguro();

        if (!('geolocation' in navigator)) {
            throw { code: 'GEO_UNAVAILABLE', message: 'GPS não disponível no navegador.' };
        }

        // Reutiliza captura recente (até 5 minutos)
        if (this.lastLocation && Date.now() - (this.lastLocation.ts || 0) < 5 * 60 * 1000) {
            return this.lastLocation;
        }

        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, REQUEST_OPTIONS);
        });

        const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            ts: Date.now()
        };

        this.salvarLocalizacao(location);
        return location;
    }
}

export const geoService = new GeoService();
