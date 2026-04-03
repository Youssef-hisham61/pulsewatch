const serviceModel = require('../models/serviceModel');
const logger = require('../middleware/logger');

async function listServices(req, res) {
  try {
    const services = await serviceModel.getAll();
    return res.json(services);
  } catch (err) {
    logger.error('Failed to list services', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function addService(req, res) {
  const { name, url } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (name.trim().length > 255) {
    return res.status(400).json({ error: 'name must be 255 characters or fewer' });
  }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'url is not a valid URL' });
  }

  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'url must use http or https' });
  }

  try {
    const service = await serviceModel.create({
      name: name.trim(),
      url,
      ownerId: req.user.sub,
    });

    logger.info('Service added', {
      serviceId: service.id,
      name: service.name,
      url: service.url,
      addedBy: req.user.email,
    });

    return res.status(201).json(service);
  } catch (err) {
    logger.error('Failed to add service', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteService(req, res) {
  const id = parseInt(req.params.id, 10);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid service ID' });
  }

  try {
    const deleted = await serviceModel.remove(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Service not found' });
    }

    logger.info('Service deleted', { serviceId: id, deletedBy: req.user.email });

    return res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    logger.error('Failed to delete service', { error: err.message, serviceId: id });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getServiceResults(req, res) {
  const id = parseInt(req.params.id, 10);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid service ID' });
  }

  try {
    const service = await serviceModel.findById(id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const results = await serviceModel.getResults(id);
    return res.json({ service, results });
  } catch (err) {
    logger.error('Failed to fetch service results', { error: err.message, serviceId: id });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { listServices, addService, deleteService, getServiceResults };
