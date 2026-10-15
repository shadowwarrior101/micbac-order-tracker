-- order_number becomes database-assigned ("ORDER 006", "ORDER 007", ...) instead of typed by hand.
-- A sequence (not max()+1 in the app) so two owners saving at the same moment can't collide.

CREATE SEQUENCE public.order_number_seq;

-- Hand-typed numbers were "order 001" / "ORDER 002" / "Order 004": normalise to one format.
UPDATE public.orders
  SET order_number = 'ORDER ' || lpad(substring(order_number FROM '\d+'), 3, '0')
  WHERE order_number ~ '\d+';

-- Continue after the highest existing number (is_called=false when there are none -> starts at 1).
SELECT setval(
  'public.order_number_seq',
  GREATEST(COALESCE(MAX(substring(order_number FROM '\d+')::int), 0), 1),
  COALESCE(MAX(substring(order_number FROM '\d+')::int), 0) > 0
) FROM public.orders;

CREATE OR REPLACE FUNCTION public.format_order_number(n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  -- lpad would truncate past 999, so only pad up to 3 digits.
  SELECT 'ORDER ' || lpad(n::text, GREATEST(3, length(n::text)), '0');
$$;

-- Orders that never got a number (created before the column, or left blank) get one now, oldest first.
UPDATE public.orders o
  SET order_number = public.format_order_number(missing.n)
  FROM (
    SELECT id, nextval('public.order_number_seq') AS n
    FROM (SELECT id FROM public.orders WHERE order_number IS NULL ORDER BY created_at) AS oldest_first
  ) AS missing
  WHERE o.id = missing.id;

-- SECURITY DEFINER so callers need no USAGE grant on the sequence. Always overwrites whatever
-- the client sent on insert, and pins the number on update — it's an identifier, not an editable field.
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.order_number := public.format_order_number(nextval('public.order_number_seq'));
  ELSE
    NEW.order_number := OLD.order_number;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_assign_order_number
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();
