import { customerRepository } from './customer.repository'
import type { CreateCustomerInput, UpdateCustomerInput } from './customer.schema'
import { NotFoundError } from '../../shared/errors'

const generateCustomerCode = (lastNumber: number) => {
  return `CUST-${String(lastNumber).padStart(4, '0')}`
}

export const customerService = {
  async list(outletId: string, search?: string) {
    return customerRepository.findMany(outletId, search)
  },

  async getById(id: string) {
    const customer = await customerRepository.findById(id)

    if (!customer) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')

    return customer
  },

  async create(input: CreateCustomerInput, outletId: string) {
    const totalCustomer = await customerRepository.findMany(outletId)

    const code = generateCustomerCode(totalCustomer.length + 1)

    return customerRepository.create({
      ...input,
      code,
      outletId,
    })
  },

  async update(id: string, input: UpdateCustomerInput) {
    const existing = await customerRepository.findById(id)

    if (!existing) {
      throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    }

    return customerRepository.update(id, input)
  },

  async delete(id: string) {
    const existing = await customerRepository.findById(id)

    if (!existing) {
      throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND')
    }

    return customerRepository.softDelete(id)
  },
}
