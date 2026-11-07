const OfflineStorage = {
  async getItem(key: string) {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

export default OfflineStorage;
