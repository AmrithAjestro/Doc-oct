/**
 * Parses req.params / req.query / req.body with zod schemas and replaces them with the parsed
 * (trimmed, coerced, defaulted) values. Anything not in the schema is stripped.
 */
const validate = (schemas) => (req, res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key] ?? {});
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = validate;
