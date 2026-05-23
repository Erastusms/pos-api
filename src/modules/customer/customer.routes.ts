import type { FastifyInstance } from 'fastify'
import { customerController } from './customer.controller'
import { authenticate } from '../../shared/middlewares/authenticate'
import { authorize } from '../../shared/middlewares/authorize'
import { RESOURCES, ACTIONS } from '../../shared/constants/permissions'

const can = (action: string) => [authenticate, authorize(RESOURCES.CUSTOMER, action as never)]

export async function customerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get(
    '/',
    {
      preHandler: can(ACTIONS.READ),
    },
    customerController.getList,
  )

  app.get(
    '/:id',
    {
      preHandler: can(ACTIONS.READ),
    },
    customerController.getById,
  )

  app.post(
    '/',
    {
      preHandler: can(ACTIONS.CREATE),
    },
    customerController.create,
  )

  app.put(
    '/:id',
    {
      preHandler: can(ACTIONS.UPDATE),
    },
    customerController.update,
  )

  app.delete(
    '/:id',
    {
      preHandler: can(ACTIONS.DELETE),
    },
    customerController.delete,
  )
}
