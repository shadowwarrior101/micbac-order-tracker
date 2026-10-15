import { useEffect, useState } from 'react'
import { X, Save, Paperclip } from 'lucide-react'
import { createOrder, updateOrder } from '../lib/supabase'
import { localDateStr } from '../lib/dates'
import { getCustomers, addCustomer, normalizeCustomerName } from '../lib/customers'
import BrandingPicker from './BrandingPicker'
import Combobox from './Combobox'
import { COUNTRIES } from '../lib/countries'
import { FACTORIES } from '../lib/factories'
import { orderProfit } from '../lib/profit'
import '../styles/OrderForm.css'

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', emoji: '🔴' },
  { value: 'high', label: 'High', emoji: '🟠' },
  { value: 'normal', label: 'Normal', emoji: '🔵' },
  { value: 'low', label: 'Low', emoji: '⚪' },
]

const usd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const INITIAL = {
  item: '',
  quantity: '',
  customer: '',
  po_number: '',
  destination_country: '',
  factory: '',
  order_value: '',
  selling_price: '',
  priority: 'normal',
  packaging: 'box',
  bag_count: '',
  bag_type: '',
  branding: 'Default',
  readiness_date: '',
  delivery_address: '',
  notes: '',
}

function toFormState(order) {
  return {
    item: order.item ?? '',
    quantity: order.quantity != null ? String(order.quantity) : '',
    customer: order.customer ?? '',
    po_number: order.po_number ?? '',
    destination_country: order.destination_country ?? '',
    factory: order.factory ?? '',
    order_value: order.order_value != null ? String(order.order_value) : '',
    selling_price: order.selling_price != null ? String(order.selling_price) : '',
    priority: order.priority ?? 'normal',
    packaging: order.packaging ?? 'box',
    bag_count: order.bag_count != null ? String(order.bag_count) : '',
    bag_type: order.bag_type ?? '',
    branding: order.branding ?? 'Default',
    readiness_date: order.readiness_date ?? '',
    delivery_address: order.delivery_address ?? '',
    notes: order.notes ?? '',
  }
}

export default function OrderForm({ user, order, onClose, onSuccess }) {
  const isEdit = !!order
  const [form, setForm] = useState(() => (isEdit ? toFormState(order) : INITIAL))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customers, setCustomers] = useState([])

  useEffect(() => {
    getCustomers()
      .then(setCustomers)
      .catch((err) => console.error('Failed to load customers:', err))
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.item.trim() || !form.quantity || !form.customer.trim() || !form.readiness_date) {
      setError('Please fill in all required fields.')
      return
    }
    setLoading(true)
    setError('')
    const customer = normalizeCustomerName(form.customer)
    const payload = {
      ...form,
      customer,
      quantity: parseInt(form.quantity, 10),
      order_value: form.order_value ? parseFloat(form.order_value) : null,
      selling_price: form.selling_price ? parseFloat(form.selling_price) : null,
      po_number: form.po_number || null,
      destination_country: normalizeCustomerName(form.destination_country) || null,
      factory: normalizeCustomerName(form.factory) || null,
      bag_count: form.bag_count ? parseInt(form.bag_count, 10) : null,
      bag_type: form.bag_type.trim() || null,
      delivery_address: form.delivery_address || null,
    }
    try {
      if (isEdit) {
        await updateOrder(order.id, payload, user.username)
      } else {
        await createOrder(payload, user.username)
      }
      // Remember a newly typed customer for next time. Best-effort: the order is already saved,
      // so a failure here shouldn't surface as an order error.
      const known = customers.some((c) => c.name.toLowerCase() === customer.toLowerCase())
      if (!known) {
        try {
          await addCustomer(customer)
        } catch (err) {
          console.error('Failed to save new customer:', err)
        }
      }
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const today = localDateStr()
  const profit = orderProfit({
    order_value: form.order_value ? parseFloat(form.order_value) : null,
    selling_price: form.selling_price ? parseFloat(form.selling_price) : null,
  })

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-title"
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="form-title">{isEdit ? 'Edit Order' : 'New Order'}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="priority-grid">
            {PRIORITIES.map(({ value, label, emoji }) => (
              <button
                key={value}
                type="button"
                className={`priority-card priority-${value} ${form.priority === value ? 'priority-selected' : ''}`}
                onClick={() => setForm((f) => ({ ...f, priority: value }))}
              >
                <span className="priority-emoji">{emoji}</span>
                {label}
              </button>
            ))}
          </div>

          <div className="form-grid">
            <div className="form-group form-group-full">
              <label htmlFor="item">Item / Product *</label>
              <input
                id="item"
                name="item"
                type="text"
                value={form.item}
                onChange={handleChange}
                placeholder="e.g. Steel Rods 10mm"
                required
                autoFocus
              />
            </div>

            {/* Assigned by the database on insert (orders_assign_order_number trigger) — never sent. */}
            <div className="form-group">
              <label htmlFor="order_number">Order Number</label>
              <input
                id="order_number"
                type="text"
                value={order?.order_number ?? ''}
                placeholder="Assigned automatically on save"
                readOnly
                disabled
              />
            </div>

            <div className="form-group">
              <label htmlFor="po_number">PO Number</label>
              <input
                id="po_number"
                name="po_number"
                type="text"
                value={form.po_number}
                onChange={handleChange}
                placeholder="e.g. PO-10234"
              />
            </div>

            <div className="form-group">
              <label htmlFor="customer">Customer *</label>
              <Combobox
                id="customer"
                value={form.customer}
                options={customers.map((c) => c.name)}
                onChange={(name) => setForm((f) => ({ ...f, customer: name }))}
                placeholder="Pick from list or type a new one"
                addLabel={(name) => `Add “${name}” as new customer`}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="destination_country">Destination Country</label>
              <Combobox
                id="destination_country"
                value={form.destination_country}
                options={COUNTRIES}
                onChange={(country) => setForm((f) => ({ ...f, destination_country: country }))}
                placeholder="e.g. Malaysia"
              />
            </div>

            <div className="form-group">
              <label htmlFor="quantity">Quantity (kg) *</label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                value={form.quantity}
                onChange={handleChange}
                placeholder="e.g. 28000"
                min="1"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="readiness_date">Readiness Date *</label>
              <input
                id="readiness_date"
                name="readiness_date"
                type="date"
                value={form.readiness_date}
                onChange={handleChange}
                min={isEdit ? undefined : today}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="order_value">Order Value / Cost (USD)</label>
              <input
                id="order_value"
                name="order_value"
                type="number"
                value={form.order_value}
                onChange={handleChange}
                placeholder="e.g. 12000"
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label htmlFor="selling_price">Selling Price (USD, total)</label>
              <input
                id="selling_price"
                name="selling_price"
                type="number"
                value={form.selling_price}
                onChange={handleChange}
                placeholder="e.g. 14000"
                min="0"
                step="0.01"
              />
              {profit && (
                <span className={`form-hint ${profit.profit < 0 ? 'form-hint-loss' : 'form-hint-profit'}`}>
                  {profit.profit < 0 ? 'Loss' : 'Profit'}: {usd(Math.abs(profit.profit))}
                  {profit.margin != null && ` (${profit.margin.toFixed(1)}% margin)`}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="bag_count">No. of Bags</label>
              <input
                id="bag_count"
                name="bag_count"
                type="number"
                value={form.bag_count}
                onChange={handleChange}
                placeholder="e.g. 1120"
                min="1"
                step="1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="bag_type">Type of Bags</label>
              <input
                id="bag_type"
                name="bag_type"
                type="text"
                value={form.bag_type}
                onChange={handleChange}
                placeholder="e.g. 25 kg PP woven bag"
              />
            </div>

            <div className="form-group">
              <label htmlFor="packaging">Packaging</label>
              <select id="packaging" name="packaging" value={form.packaging} onChange={handleChange}>
                <option value="box">Box</option>
                <option value="bag">Bag</option>
                <option value="bulk">Bulk</option>
                <option value="pallet">Pallet</option>
                <option value="drum">Drum</option>
                <option value="jumbo_bag">Jumbo Bag</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="factory">Factory</label>
              <Combobox
                id="factory"
                value={form.factory}
                options={FACTORIES}
                onChange={(name) => setForm((f) => ({ ...f, factory: name }))}
                placeholder="Pick or type a factory"
                addLabel={(name) => `Use “${name}”`}
              />
            </div>

            <div className="form-group form-group-full">
              <label>Branding</label>
              <BrandingPicker value={form.branding} onChange={(label) => setForm((f) => ({ ...f, branding: label }))} />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="delivery_address">Delivery Address</label>
              <input
                id="delivery_address"
                name="delivery_address"
                type="text"
                value={form.delivery_address}
                onChange={handleChange}
                placeholder="e.g. 12 Dock Rd, Mumbai Port, India"
              />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Special instructions, references…"
                rows={3}
              />
            </div>

            <div className="form-group form-group-full">
              <label>Attachments</label>
              <div className="attachment-dropzone">
                <Paperclip size={18} />
                <span>Drag files here or click to upload (coming soon)</span>
              </div>
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Save size={16} />
              {isEdit ? (loading ? 'Saving…' : 'Save Changes') : loading ? 'Creating…' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
