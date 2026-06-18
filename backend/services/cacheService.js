class CacheService {
  constructor(defaultTTL = 3600) {
    this.cache = new Map();
    this.ttls = new Map();
    this.defaultTTL = defaultTTL;
  }

  cacheFeature(teamId, featureName, value, ttl = this.defaultTTL) {
    const key = this.generateKey(teamId, featureName);
    this.cache.set(key, value);
    this.ttls.set(key, Date.now() + (ttl * 1000));
  }

  getCachedFeature(teamId, featureName) {
    const key = this.generateKey(teamId, featureName);
    const value = this.cache.get(key);
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.cache.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return value;
  }

  clearTeamCache(teamId) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${teamId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.ttls.delete(key);
    });
  }

  clearAll() {
    this.cache.clear();
    this.ttls.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  generateKey(teamId, featureName) {
    return `${teamId}:${featureName}`;
  }
}

export default new CacheService();
