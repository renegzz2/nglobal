import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { buscarCatalogoPorNombre, conciliarProductoExcel, crearPartidasDesdeExcel, leerLayoutEmbarque } from '../lib/usaEmbarquesImport.ts';
import type { ProductoCatalog } from '../lib/usaEmbarquesImport.ts';

const catalogo: ProductoCatalog[] = [
    { id: 'a5', nombre_del_producto: 'Mango', alias_usa: 'Primera', config_usa: '5 lbs' },
    { id: 'b25', nombre_del_producto: 'Mango', alias_usa: 'Segunda', config_usa: '25 lbs' },
    { id: 'a25', nombre_del_producto: 'Mango', alias_usa: 'Primera', config_usa: '25 lbs' },
    { id: 'b5', nombre_del_producto: 'Mango', alias_usa: 'Segunda', config_usa: '5 lbs' }
];

test('lee los datos de salida y conserva el detalle de un layout con fecha y hora en columnas separadas', () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Catálogo']]), 'Lista');
    const hoja = XLSX.utils.aoa_to_sheet([
        ['TRANSPORTE', 'ESCOBAR', 'CLIENTE:', 'EXP GROUP LLC', null, 'PLACAS TRACTOR:', 'ABC123'],
        ['OPERADOR', 'NOMBRE\n OPERADOR', 'FECHA Y HORA DE SALIDA:', 46347, 85800 / 86400, 'PLACAS CAJA:', '0007'],
        ['NO. TELÉFONO', 1234567890, null, null, null, 'ECONÓMICO', 1],
        [null, null, null, null, null, 'PIES', 53],
        ['PRODUCTO', 'PALLET ', 'CAJAS ', 'CALIDAD', 'LBS'],
        ['Mango', 1, 60, 'Primera', '5 LBS'],
        ['Mango', 2, 80, 'Segunda', '25 LBS'],
    ]);
    hoja.G3.z = '00';
    hoja.G3.w = '01';
    hoja['!merges'] = [XLSX.utils.decode_range('D1:E1')];
    XLSX.utils.book_append_sheet(libro, hoja, 'Layout');

    const { datos, filas } = leerLayoutEmbarque(libro);
    assert.deepEqual(datos, {
        transportista: 'ESCOBAR', cliente: 'EXP GROUP LLC', placasTractor: 'ABC123', operador: 'NOMBRE OPERADOR',
        salida: '2026-11-21T23:50:00', placasCaja: '0007', celular: '1234567890', economico: '01', pies: '53',
    });
    assert.deepEqual(crearPartidasDesdeExcel(filas, catalogo).map(p => [p.producto_id, p.numero_pallet, p.cantidad_cajas]),
        [['a5', '1', 60], ['b25', '2', 80]]);
});

test('admite fecha y hora como texto y deja disponible la captura manual con un layout anterior', () => {
    const libro = XLSX.utils.book_new();
    const filas = [['PRODUCTO', 'PALLET', 'CAJAS'], ['Mango', 1, 60]];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['FECHA DE SALIDA', '21/11/2026', 'HORA DE SALIDA', '12:05 a. m.'],
        ...filas,
    ]), 'Layout');
    assert.equal(leerLayoutEmbarque(libro).datos.salida, '2026-11-21T00:05:00');
    libro.Sheets.Layout = XLSX.utils.aoa_to_sheet(filas);
    assert.deepEqual(leerLayoutEmbarque(libro).datos, {});
    assert.equal(leerLayoutEmbarque(libro).filas.length, 1);
});

test('respeta los libros que usan el calendario de 1904 y una sola celda para la salida', () => {
    const libro = XLSX.utils.book_new();
    libro.Workbook = { WBProps: { date1904: true } };
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
        ['FECHA Y HORA DE SALIDA', 44885.5],
        ['PRODUCTO', 'CAJAS'],
        ['Mango', 60],
    ]), 'Layout');
    assert.equal(leerLayoutEmbarque(libro).datos.salida, '2026-11-21T12:00:00');
});

test('lee la temperatura programada en Fahrenheit y un termógrafo único de las tarimas', () => {
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet([
        ['TEMPERATURA PROGRAMADA', '50°F'],
        ['TEMPERATURA DE SALIDA (DIGITAL)', '55°F'],
        ['PRODUCTO', 'PALLET', 'CAJAS', 'TERMÓGRAFO '],
        ['Mango', 1, 60, 'K721794'],
        ['Mango', 2, 60, ' k721794 '],
        ['Mango', 3, 60, 'N/A'],
        ['', null, null, 'OTRO'],
    ]);
    XLSX.utils.book_append_sheet(libro, hoja, 'Layout');

    const layout = leerLayoutEmbarque(libro);
    assert.equal(layout.datos.temperatura, 50);
    assert.equal(layout.datos.termografo, 'K721794');
    assert.equal(layout.variosTermografos, false);
    assert.equal(layout.filas.length, 3);

    hoja.D5.v = 'K000002';
    hoja.B1.v = '0 °F';
    const conflicto = leerLayoutEmbarque(libro);
    assert.equal(conflicto.datos.temperatura, 0);
    assert.equal(conflicto.datos.termografo, undefined);
    assert.equal(conflicto.variosTermografos, true);
});

test('elige nombres abreviados solo cuando la coincidencia de catálogo es única', () => {
    const clientes = ['EXP GROUP TX LLC', 'GRUPO EXP SAC'];
    const transportes = ['TRANSPORTES ESCOBAR', 'ESCOBAR DEL NORTE'];
    assert.equal(buscarCatalogoPorNombre('EXP GROUP LLC', clientes, String), clientes[0]);
    assert.equal(buscarCatalogoPorNombre('Escobar', transportes.slice(0, 1), String), transportes[0]);
    assert.equal(buscarCatalogoPorNombre('Escobar', transportes, String), undefined);
    assert.equal(buscarCatalogoPorNombre('TRANSPORTES ESCOBAR', transportes, String), transportes[0]);
});

test('elige la variante que cumple nombre, calidad Y libras, en cualquier orden', () => {
    for (const productos of [catalogo, [...catalogo].reverse()]) {
        const resultado = conciliarProductoExcel({ PRODUCTO: 'Mango', CALIDAD: 'Primera', LBS: 25 }, productos);
        assert.equal(resultado.estado, 'unico');
        if (resultado.estado === 'unico') assert.equal(resultado.producto.id, 'a25');
    }
});

test('no sustituye un conflicto de calidad o libras por una coincidencia por nombre', () => {
    for (const fila of [
        { PRODUCTO: 'Mango', CALIDAD: 'Extra', LBS: 5 },
        { PRODUCTO: 'Mango', CALIDAD: 'Primera', LBS: 40 },
        { PRODUCTO: 'Mango', CALIDAD: 'Segunda', LBS: 25 }
    ]) {
        assert.equal(conciliarProductoExcel(fila, [catalogo[0]]).estado, 'sin_coincidencia');
    }
});

test('no combina la calidad de una variante con las libras de otra', () => {
    const resultado = conciliarProductoExcel(
        { PRODUCTO: 'Mango', CALIDAD: 'Primera', LBS: 25 },
        [catalogo[0], catalogo[1]] // Primera/5 y Segunda/25: ninguna es Primera/25.
    );
    assert.equal(resultado.estado, 'sin_coincidencia');
});

test('los campos vacíos del catálogo no son comodines para datos presentes del Excel', () => {
    for (const faltantes of [
        { alias_usa: null }, { alias_usa: '  ' }, { config_usa: null }, { config_usa: undefined }
    ]) {
        assert.equal(conciliarProductoExcel(
            { PRODUCTO: 'Mango', CALIDAD: 'Primera', LBS: 5 },
            [{ ...catalogo[0], ...faltantes }]
        ).estado, 'sin_coincidencia');
    }
});

test('exige nombre completo: Mango no equivale a Mango Ataulfo ni a un nombre vacío', () => {
    for (const PRODUCTO of ['Mango Ataulfo', 'Man', '', '  ', undefined]) {
        assert.equal(conciliarProductoExcel({ PRODUCTO }, [catalogo[0]]).estado, 'sin_coincidencia');
    }
});

test('normaliza mayúsculas, espacios y pesos simples numéricos con unidad opcional', () => {
    const productos = [{ ...catalogo[0], nombre_del_producto: '  Mango  Rojo ', alias_usa: ' PRIMERA ' }];
    for (const LBS of [5, '5', ' 05.00 LB ', '5 lbs.', '5 LBS']) {
        const resultado = conciliarProductoExcel({ PRODUCTO: 'mango   rojo', CALIDAD: 'primera', LBS }, productos);
        assert.equal(resultado.estado, 'unico');
    }
});

test('no confunde 5 con 25 ni con una configuración compuesta', () => {
    for (const config_usa of ['25 lbs', '10 x 5 lbs', '5/10 lbs']) {
        assert.equal(conciliarProductoExcel({ PRODUCTO: 'Mango', LBS: 5 }, [
            { ...catalogo[0], config_usa }
        ]).estado, 'sin_coincidencia');
    }
    assert.equal(conciliarProductoExcel({ PRODUCTO: 'Mango', LBS: '10 X 5 LBS' }, [
        { ...catalogo[0], config_usa: '10 x 5 lbs' }
    ]).estado, 'unico');
});

test('datos parciales filtran por todos los criterios presentes y detectan ambigüedad', () => {
    for (const fila of [
        { PRODUCTO: 'Mango' },
        { PRODUCTO: 'Mango', CALIDAD: 'Primera' },
        { PRODUCTO: 'Mango', LBS: 5 },
        { PRODUCTO: 'Mango', CALIDAD: ' ', LBS: null }
    ]) {
        const resultado = conciliarProductoExcel(fila, catalogo);
        assert.equal(resultado.estado, 'ambiguo');
    }
    for (const fila of [
        { PRODUCTO: 'Mango' },
        { PRODUCTO: 'Mango', CALIDAD: 'Primera' },
        { PRODUCTO: 'Mango', LBS: 5 }
    ]) {
        assert.equal(conciliarProductoExcel(fila, [catalogo[0]]).estado, 'unico');
    }
});

test('duplicados con los tres atributos iguales también son ambiguos', () => {
    const resultado = conciliarProductoExcel({ PRODUCTO: 'Mango', CALIDAD: 'Primera', LBS: 5 }, [
        catalogo[0], { ...catalogo[0], id: 'duplicado' }
    ]);
    assert.equal(resultado.estado, 'ambiguo');
    if (resultado.estado === 'ambiguo') assert.equal(resultado.candidatos.length, 2);
});

test('un catálogo vacío o un producto desconocido no generan asignación', () => {
    assert.equal(conciliarProductoExcel({ PRODUCTO: 'Mango' }, []).estado, 'sin_coincidencia');
    assert.equal(conciliarProductoExcel({ PRODUCTO: 'Nopal' }, catalogo).estado, 'sin_coincidencia');
});

test('conserva filas, pallets compartidos, orden y datos; deja pendientes sin asignar', () => {
    const filas = [
        { PALLET: ' 7 ', PRODUCTO: 'Mango', CALIDAD: 'Primera', LBS: 25, CAJAS: '12', REMISION: ' R1 ', MID: ' M1 ', LOTE: ' PT1 ' },
        { PALLET: 7, PRODUCTO: 'Mango', CAJAS: 8, REMISION: 'R2', MID: 'M2', LOTE: 'PT2' },
        { PALLET: 12, PRODUCTO: 'Nopal', CALIDAD: 'Extra', LBS: 5, CAJAS: 4 }
    ];
    const copia = structuredClone(filas);
    const partidas = crearPartidasDesdeExcel(filas, catalogo, 123);
    assert.deepEqual(filas, copia);
    assert.deepEqual(partidas.map(p => p.numero_pallet), ['7', '7', '12']);
    assert.deepEqual(partidas.map(p => p.producto_id), ['a25', '', '']);
    assert.equal(new Set(partidas.map(p => p.numero_pallet)).size, 2);
    assert.equal(partidas.reduce((total, p) => total + p.cantidad_cajas, 0), 24);
    assert.deepEqual(partidas[0], {
        id: '123-0', numero_pallet: '7', producto_id: 'a25',
        remision: 'R1', mid: 'M1', lote_pt: 'PT1', cantidad_cajas: 12,
        calidad: 'Primera', lbs: '25'
    });
    assert.match(partidas[1].incidencia_importacion!, /ambigua \(4 variantes\)/);
    assert.match(partidas[2].incidencia_importacion!, /Nopal.*Extra.*5.*Sin coincidencia/);
});

test('conserva el número de pallet por posición cuando falta la columna', () => {
    const partidas = crearPartidasDesdeExcel([{ PRODUCTO: 'Mango' }, { PRODUCTO: 'Mango' }], catalogo);
    assert.deepEqual(partidas.map(p => p.numero_pallet), [1, 2]);
    assert.ok(partidas.every(p => p.producto_id === ''));
});

test('cero es un dato presente y no debe desaparecer como si faltara', () => {
    assert.equal(conciliarProductoExcel({ PRODUCTO: 'Mango', LBS: 0 }, [catalogo[0]]).estado, 'sin_coincidencia');
    const [partida] = crearPartidasDesdeExcel([{ PRODUCTO: 'Mango', LBS: 0, CALIDAD: 0 }], catalogo);
    assert.equal(partida.lbs, '0');
    assert.equal(partida.calidad, '0');
});
