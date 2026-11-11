require('dotenv').config();

const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoose = require('mongoose');
const Settings = require('./models/Settings');
const Transaction = require('./models/Transaction');

const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim());

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '20kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

function sendError(response, status, message) {
  return response.status(status).json({ error: message });
}

function cleanTransaction(input) {
  const type = input.type;
  const amount = Number(input.amount);
  const date = input.date;
  const person = typeof input.person === 'string' ? input.person.trim() : '';
  const remarks = typeof input.remarks === 'string' ? input.remarks.trim() : '';

  if (!['added', 'given', 'received'].includes(type)) return { error: 'Choose a valid transaction type.' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000000) return { error: 'Amount must be greater than zero.' };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return { error: 'Enter a valid transaction date.' };
  }
  if (['given', 'received'].includes(type) && !person) return { error: 'Person name is required for this transaction.' };
  if (person.length > 100) return { error: 'Person name must be 100 characters or fewer.' };
  if (remarks.length > 500) return { error: 'Remarks must be 500 characters or fewer.' };

  return { value: { type, amount, date, person: ['given', 'received'].includes(type) ? person : '', remarks } };
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

app.get('/api/transactions', async (_request, response, next) => {
  try {
    const documents = await Transaction.find().sort({ date: -1, createdAt: -1 });
    response.json({ transactions: documents.map((document) => document.toJSON()) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/transactions', async (request, response, next) => {
  const result = cleanTransaction(request.body || {});
  if (result.error) return sendError(response, 400, result.error);
  try {
    const transaction = await Transaction.create(result.value);
    response.status(201).json({ transaction: transaction.toJSON() });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/transactions/:id', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) return sendError(response, 400, 'Invalid transaction ID.');
  try {
    const existing = await Transaction.findById(request.params.id);
    if (!existing) return sendError(response, 404, 'Transaction not found.');
    const result = cleanTransaction({ ...existing.toObject(), ...request.body });
    if (result.error) return sendError(response, 400, result.error);
    Object.assign(existing, result.value);
    await existing.save();
    response.json({ transaction: existing.toJSON() });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/transactions/:id', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) return sendError(response, 400, 'Invalid transaction ID.');
  try {
    const deleted = await Transaction.findByIdAndDelete(request.params.id);
    if (!deleted) return sendError(response, 404, 'Transaction not found.');
    response.json({ message: 'Transaction deleted.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/settings', async (_request, response, next) => {
  try {
    const settings = await Settings.findOneAndUpdate(
      { key: 'account' },
      { $setOnInsert: { openingBalance: 0 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    response.json({ openingBalance: settings.openingBalance });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/settings', async (request, response, next) => {
  const openingBalance = Number(request.body?.openingBalance);
  if (!Number.isFinite(openingBalance) || openingBalance < 0 || openingBalance > 1000000000000) {
    return sendError(response, 400, 'Opening balance must be zero or greater.');
  }
  try {
    const settings = await Settings.findOneAndUpdate(
      { key: 'account' },
      { $set: { openingBalance } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    response.json({ openingBalance: settings.openingBalance });
  } catch (error) {
    next(error);
  }
});

app.use((_request, response) => sendError(response, 404, 'Route not found.'));
app.use((error, _request, response, _next) => {
  if (error.type === 'entity.parse.failed') return sendError(response, 400, 'Request body must be valid JSON.');
  if (error.name === 'ValidationError') return sendError(response, 400, 'Transaction data is invalid.');
  console.error(error);
  return sendError(response, 500, 'An unexpected server error occurred.');
});

async function start() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pennypath';
  await mongoose.connect(mongoUri);
  app.listen(port, () => console.log(`Pennypath API listening on port ${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { app, cleanTransaction };