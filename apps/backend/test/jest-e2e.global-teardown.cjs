/**
 * Jest e2e globalTeardown. globalSetup 이 띄운 in-memory mongo 인스턴스를 정리한다.
 */
module.exports = async () => {
  const mongod = globalThis.__MONGOD__;
  if (mongod) {
    await mongod.stop();
  }
};
