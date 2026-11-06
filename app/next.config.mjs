/** Ship the bundled ENS CLI with the /api/ens function (it's run as a child process, so tracing can't see it). */
export default {
  experimental: {
    outputFileTracingIncludes: { "/api/ens": ["./node_modules/@ensdomains/cli/dist/**"] },
  },
};
