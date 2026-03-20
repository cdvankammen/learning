function createMutationQueue() {
  let chain = Promise.resolve();

  function run(task) {
    const next = chain.then(task, task);
    chain = next.catch(() => {});
    return next;
  }

  return { run };
}

module.exports = {
  createMutationQueue
};
