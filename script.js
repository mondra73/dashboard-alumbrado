// Configuración
const DATA_URL = 'https://raw.githubusercontent.com/mondra73/script-GESU-MR/main/datos_completos.json.gz';
const PROYECCION = 'EPSG:22185'; // POSGAR 94 / Argentina 5

// Colores por tipo
const COLORES = {
    'Lámpara': '#fbbf24',
    'Columna': '#3b82f6',
    'Tablero': '#ef4444',
    'Transversal': '#10b981'
};

// Variables globales
let mapa;
let datosCompletos = [];
let capaActual;

// Inicializar mapa
function initMapa() {
    mapa = L.map('mapa').setView([-32.95, -60.66], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapa);
}

// Convertir coordenadas POSGAR a Lat/Lng (aproximado para Rosario)
function posgarALatLng(x, y) {
    // Factores aproximados para Rosario (POSGAR 94 / Argentina 5)
    const lat = -32.95 + (y - 6350000) / 100000 * 0.009;
    const lng = -60.66 + (x - 5430000) / 100000 * 0.011;
    return [lat, lng];
}

// Cargar y descomprimir datos desde GitHub
async function cargarDatos() {
    try {
        document.getElementById('info-actualizacion').textContent = 'Cargando datos...';
        
        const respuesta = await fetch(DATA_URL);
        if (!respuesta.ok) throw new Error('Error al descargar datos');
        
        const buffer = await respuesta.arrayBuffer();
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        const texto = await new Response(stream).text();
        
        const json = JSON.parse(texto);
        datosCompletos = json.datos;
        
        document.getElementById('info-actualizacion').textContent = 
            `Actualizado: ${new Date(json.actualizado).toLocaleString('es-AR')} | ${json.total} registros`;
        
        mostrarEnMapa(datosCompletos);
        crearLeyenda();
    } catch (error) {
        document.getElementById('info-actualizacion').textContent = 'Error al cargar datos';
        console.error(error);
    }
}

// Mostrar puntos en el mapa
function mostrarEnMapa(datos) {
    if (capaActual) mapa.removeLayer(capaActual);
    
    const marcadores = [];
    
    for (const item of datos) {
        const x = parseFloat(item['Ubicación: Coordenada X']);
        const y = parseFloat(item['Ubicación: Coordenada Y']);
        
        if (isNaN(x) || isNaN(y)) continue;
        
        const [lat, lng] = posgarALatLng(x, y);
        const tipo = item['Tipo'] || 'Desconocido';
        const color = COLORES[tipo] || '#94a3b8';
        
        const marcador = L.circleMarker([lat, lng], {
            radius: 6,
            fillColor: color,
            color: '#1e293b',
            weight: 1,
            fillOpacity: 0.8
        });
        
        marcador.bindPopup(`
            <strong>${tipo}</strong><br>
            ${item['Ubicación: Calle'] || ''} ${item['Ubicación: Altura'] || ''}<br>
            ID: ${item['ID']}<br>
            Estado: ${item['Estado']}
        `);
        
        marcadores.push(marcador);
    }
    
    capaActual = L.layerGroup(marcadores).addTo(mapa);
}

// Crear leyenda
function crearLeyenda() {
    const leyenda = document.getElementById('leyenda');
    leyenda.innerHTML = '';
    
    for (const [tipo, color] of Object.entries(COLORES)) {
        const item = document.createElement('div');
        item.className = 'leyenda-item';
        item.innerHTML = `<span class="leyenda-color" style="background:${color}"></span>${tipo}`;
        leyenda.appendChild(item);
    }
}

// Buscador
function initBuscador() {
    const input = document.getElementById('input-busqueda');
    const resultados = document.getElementById('resultados-busqueda');
    
    input.addEventListener('input', () => {
        const termino = input.value.toLowerCase().trim();
        resultados.innerHTML = '';
        
        if (termino.length < 2) return;
        
        const filtrados = datosCompletos.filter(item => {
            const calle = (item['Ubicación: Calle'] || '').toLowerCase();
            const altura = (item['Ubicación: Altura'] || '').toString();
            const id = (item['ID'] || '').toString();
            return calle.includes(termino) || altura.includes(termino) || id.includes(termino);
        }).slice(0, 50);
        
        filtrados.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item['Ubicación: Calle'] || ''} ${item['Ubicación: Altura'] || ''} (ID: ${item['ID']})`;
            li.addEventListener('click', () => centrarEnItem(item));
            resultados.appendChild(li);
        });
    });
}

// Centrar mapa en un item
function centrarEnItem(item) {
    const x = parseFloat(item['Ubicación: Coordenada X']);
    const y = parseFloat(item['Ubicación: Coordenada Y']);
    
    if (isNaN(x) || isNaN(y)) return;
    
    const [lat, lng] = posgarALatLng(x, y);
    mapa.setView([lat, lng], 18);
    
    document.getElementById('resultados-busqueda').innerHTML = '';
    document.getElementById('input-busqueda').value = '';
}

// Iniciar
initMapa();
cargarDatos();
initBuscador();