SELECT
    o.id AS order_id,
   
    o.order_date,
    o.required_date,
    o.shipped_date,
    o.ship_via,
    o.freight,
    o.ship_name,
    o.ship_address,
    o.ship_city,
    o.ship_region,
    o.ship_postal_code,
    o.ship_country,
    e.employee_id,
    e.last_name,
    e.first_name,
    e.job_title,
    e.city AS employee_city,
    e.country AS employee_country
FROM stg_employee e
JOIN stg_order o
  ON e.employee_id = o.employee_id;