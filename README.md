# Cooperativa de Trabajo Molino Florida — ContCoop

Aplicación de contabilidad cooperativa con partida doble, costeo conjunto de molienda, libro mayor,
balance de sumas y saldos, anticipos de retorno y simulador de distribución de excedente.

Todo funciona sin backend: los datos persisten en localStorage del navegador.


## Cómo arrancarlo

Opción 1: abrir desde un servidor local (recomendado)
Abrir index.html

Opción 2: publicado en GitHub Pages
https://Gertecin.github.io/261112_ContCoop/

    
## Qué está simulado

- No hay backend. Todo se guarda en localStorage.
- No hay correo, WhatsApp ni pagos reales.
- Los nombres, clientes, socios, empleados y montos son datos de ejemplo verosímiles.
- El recargo nocturno del 20 %, la energía de molienda de $U 0,85 por kilo y los porcentajes de
  distribución del excedente son parámetros de ejemplo configurables. No son normativa uruguaya ni
  asesoramiento contable; los valida un contador.
- Los empleados no socios no participan del excedente porque su remuneración es una relación de
  dependencia registrada en «Sueldos y jornales». El retorno cooperativo se distribuye solo entre
  socios, en proporción a sus horas del ejercicio.

## Datos semilla

La semilla se genera por código con semilla fija en js/seed.js. Incluye:

- 260 asientos contables confirmados.
- 90 moliendas de 12.000 kg.
- 33 socios.
- 12 empleados no socios.
- 70 clientes.
- 7 meses cerrados: 2026-01 a 2026-07.
- Un par de asiento y reversión vinculados para comprobar que el mayor queda en cero.

## Cómo reiniciar los datos de ejemplo

- Entrá a /admin y usá «Reiniciar datos de ejemplo», o
- borrá la clave contcoop_261112_v1 del localStorage del navegador y recargá.

## Panel de administración

La navegación pública es libre. Solo la ruta /admin pide clave.

Clave por defecto: molino2026

La clave se puede cambiar en /admin.

## Ejemplo manual de costeo conjunto

Para una molienda de 12.000 kg:

- Trigo: 12.000 kg × $U 11,40 = $U 136.800
- Energía: 12.000 kg × $U 0,85 = $U 10.200
- Costo total de la molienda = $U 147.000

Rendimientos y valores:

- Harina 000: 6.240 kg × $U 28 = $U 174.720
- Harina 0000: 1.680 kg × $U 34 = $U 57.120
- Harina 00: 360 kg × $U 26 = $U 9.360
- Harina 0: 360 kg × $U 22 = $U 7.920
- Harina integral: 240 kg × $U 30 = $U 7.200
- Salvado: 2.400 kg × $U 9 = $U 21.600
- Germen: 240 kg × $U 45 = $U 10.800
- Merma: 480 kg, sin costo asignado

El costo se asigna por valor de venta relativo:

    costo producto = costo total × valor producto / suma de valores

La suma de los costos asignados es exactamente igual al costo total de la molienda.
El redondeo al centésimo se asigna al producto de mayor valor.

## Cómo sustituir los datos de ejemplo

Editar js/seed.js:

- Cambiar la constante SEED para regenerar datos distintos pero determinísticos.
- Ajustar cuentas, productos, rendimientos, precios, socios, empleados o clientes.
- Después de guardar, reiniciar datos desde /admin o borrar localStorage.

## Notas para integrador de backend

Cuando exista backend, reemplazar:

- loadState/saveRaw por llamadas a una API de persistencia.
- La generación de asientos y moliendas por transacciones del servidor.
- El control de meses cerrados por permisos y auditoría.
- La clave local de /admin por autenticación real.
