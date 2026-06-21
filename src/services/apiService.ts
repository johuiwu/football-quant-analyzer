export interface ApiConfig {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

const defaultConfig: ApiConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 10000
};

export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  config: ApiConfig = {}
): Promise<T> {
  const { maxRetries = defaultConfig.maxRetries, retryDelay = defaultConfig.retryDelay } = config;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || defaultConfig.timeout);

      // Merge external signal with our timeout controller instead of overriding
      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort());
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.warn(`[API] request failed (attempt ${attempt}/${maxRetries}): ${lastError.message}, retry in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`request failed after ${maxRetries} retries`);
}

export async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeout: number = 10000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Merge external signal with our timeout controller instead of overriding
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getTeams(): Promise<any[]> {
  try {
    return await fetchWithRetry('/api/teams');
  } catch (error) {
    console.error('[API] Failed to get teams:', error);
    throw new Error('Cannot get teams data, please check network or retry later');
  }
}

export async function syncStandings(league: string): Promise<any> {
  try {
    return await fetchWithRetry(`/api/sync-standings?league=${encodeURIComponent(league)}`, {}, { timeout: 120000, maxRetries: 1 });
  } catch (error) {
    console.error('[API] Failed to sync standings:', error);
    throw new Error('Failed to sync standings, please check network or retry later');
  }
}

export async function getMatchData(matchId: string): Promise<any> {
  try {
    return await fetchWithRetry(`/api/matches/${matchId}`);
  } catch (error) {
    console.error('[API] Failed to get match data:', error);
    throw new Error('Cannot get match data, please check network or retry later');
  }
}
