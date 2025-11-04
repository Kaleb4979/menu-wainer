// Variables globales para datos que se cargarán
let MENU_DATA = null;
let ALL_ITEMS_MAP = {}; // Mapa para acceder fácilmente a los ítems por ID
let cart = {}; 
        
// --- Funciones de Utilidad ---

// Función de Haversine para calcular la distancia entre dos coordenadas (en km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (value) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    
    return distance;
}

// --- Función principal para cargar el menú ---
async function loadMenuData() {
    try {
        // Fetch de datos desde el archivo JSON
        const response = await fetch('menu_data.json');
        if (!response.ok) {
            throw new Error('No se pudo cargar menu_data.json');
        }
        const data = await response.json();
        MENU_DATA = data;
        
        // 1. Inicializar el mapa de ítems y poblar la información del header
        document.getElementById('promo-container').textContent = data.info.promo;
        document.getElementById('schedule-container').innerHTML = `🕔 **HORARIO DE ATENCIÓN:** ${data.info.schedule}`;
        
        let menuHtml = '';
        data.categories.forEach(category => {
            menuHtml += `
                <section class="menu-category">
                    <h2>${category.name}</h2>
                    <p class="slogan">${category.slogan}</p>
                    <div class="menu-item-list">
            `;

            category.items.forEach(item => {
                // Almacenar el ítem en el mapa global para acceso rápido por ID
                ALL_ITEMS_MAP[item.id] = {...item, category_name: category.name};
                
                const topVentaTag = item.top_venta ? '<span class="top-venta-tag">⭐ TOP VENTA</span>' : '';
                
                menuHtml += `
                    <div class="menu-item" data-id="${item.id}">
                        <span class="item-info">${item.name} ${topVentaTag}</span>
                        <div class="item-controls">
                            <span class="price">${item.price.toFixed(2)}$</span>
                            <div class="quantity-control">
                                <button class="quantity-btn" onclick="updateCart('${item.id}', -1)">-</button>
                                <span class="item-quantity">0</span>
                                <button class="quantity-btn" onclick="updateCart('${item.id}', 1)">+</button>
                            </div>
                        </div>
                    </div>
                `;
            });

            menuHtml += `
                    </div>
                </section>
            `;
        });

        document.getElementById('menu-content-container').innerHTML = menuHtml;
        
        // 2. Iniciar el loop de actualización
        updateCartDisplay();
        setInterval(updateCartDisplay, 1000);

    } catch (error) {
        console.error("Error al cargar o renderizar el menú:", error);
        document.getElementById('menu-content-container').innerHTML = `<p style="color:red; text-align:center;">❌ ERROR: No se pudo cargar el menú. Verifica que el archivo **menu_data.json** exista y esté correcto.</p>`;
    }
}


// --- Lógica de Pedir de Nuevo ---

function loadLastOrder() {
    // 1. Obtener el último pedido guardado
    const lastOrderString = localStorage.getItem('lastOrderCart');
    if (!lastOrderString) return;

    try {
        const lastOrder = JSON.parse(lastOrderString);
        let newCart = {};
        let successCount = 0;

        // 2. Recorrer el pedido guardado y reconstruir el carrito
        for (const itemId in lastOrder) {
            const item = lastOrder[itemId];
            
            // 3. Verificar si el ítem todavía existe en el menú (para evitar errores de productos descontinuados)
            if (ALL_ITEMS_MAP[itemId]) {
                 newCart[itemId] = {
                    id: itemId,
                    name: item.name,
                    price: ALL_ITEMS_MAP[itemId].price, // Usar el precio actual del JSON
                    category: item.category,
                    quantity: item.quantity
                };
                successCount++;
            }
        }

        if (successCount > 0) {
            cart = newCart; // Reemplazar el carrito actual con el último pedido
            alert(`✅ Último pedido (${successCount} ítems) cargado al carrito.`);
            updateCartDisplay();
        } else {
            alert("No se pudo cargar el último pedido. Puede que los productos hayan sido descontinuados.");
        }

    } catch (e) {
        console.error("Error al parsear el último pedido:", e);
        alert("Hubo un error al recuperar el último pedido.");
    }
}


// --- Funciones de Carrito y Display ---
function updateCart(itemId, change) {
    const itemData = ALL_ITEMS_MAP[itemId];
    if (!itemData) return;
    
    let currentQuantity = cart[itemId] ? cart[itemId].quantity : 0;
    let newQuantity = currentQuantity + change;

    if (newQuantity < 0) return;

    if (newQuantity === 0) {
        delete cart[itemId];
    } else {
        cart[itemId] = {
            id: itemId,
            name: itemData.name,
            price: itemData.price,
            category: itemData.category_name,
            quantity: newQuantity
        };
    }

    updateCartDisplay();
}

function updateCartDisplay() {
    if (!MENU_DATA) return;

    let subtotal = 0;
    let totalItems = 0;
    
    for (const id in cart) {
        const item = cart[id];
        subtotal += item.price * item.quantity;
        totalItems += item.quantity;
    }

    const isDelivery = document.getElementById('delivery-checkbox').checked;
    const deliveryDetails = document.getElementById('delivery-details');
    const checkoutBtn = document.getElementById('checkout-btn');
    const reorderContainer = document.getElementById('reorder-container'); // Nuevo

    document.querySelectorAll('.menu-item').forEach(itemEl => {
        const itemId = itemEl.getAttribute('data-id');
        const quantityElement = itemEl.querySelector('.item-quantity');
        quantityElement.textContent = cart[itemId] ? cart[itemId].quantity : 0;
    });

    if (totalItems > 0) {
        checkoutBtn.disabled = false;
    } else {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = `Hacer Pedido por WhatsApp`;
    }
    
    // Lógica de deshabilitación por Límite de tiempo
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        checkoutBtn.disabled = true;
        const remainingSeconds = Math.ceil((COOLDOWN_SECS * 1000 - (now - lastOrderTime)) / 1000);
        checkoutBtn.textContent = `ESPERA: ${remainingSeconds}s para nuevo pedido`;
    }

    // Lógica del Botón Reordenar (visible solo si el carrito está vacío)
    const lastOrderCart = localStorage.getItem('lastOrderCart');
    if (lastOrderCart && totalItems === 0) {
        reorderContainer.innerHTML = `<button onclick="loadLastOrder()" style="background-color: #FFD700; color: #333; padding: 10px 20px; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">🔁 Pedir Mi Último Pedido</button>`;
    } else {
        reorderContainer.innerHTML = '';
    }

    // Lógica del Delivery y display de totales
    if (isDelivery) {
        document.getElementById('cart-total-price').textContent = subtotal.toFixed(2);
        deliveryDetails.textContent = "Costo de Delivery se calculará al confirmar la ubicación. (1$ por km, mínimo 1$)";
        
        if (totalItems > 0 && !checkoutBtn.disabled) {
             checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Subtotal: ${subtotal.toFixed(2)}$`;
        }
    } else {
        document.getElementById('cart-total-price').textContent = subtotal.toFixed(2);
        deliveryDetails.textContent = "Retiro en Tienda seleccionado.";
        
        if (totalItems > 0 && !checkoutBtn.disabled) {
            checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Total: ${subtotal.toFixed(2)}$`;
        }
    }

    if (totalItems === 0) {
        document.getElementById('cart-total-price').textContent = "0.00";
    }
}

// --- Lógica de Envío ---

function sendOrder(subtotal, finalTotal, distanceKm, lat, lon) {
    
    const isDelivery = document.getElementById('delivery-checkbox').checked;
    let message = "🛒 *NUEVO PEDIDO PA QUE WAINER* 🍔\n\n";
    
    // 1. Preparar mensaje
    for (const id in cart) {
        const item = cart[id];
        const itemSubtotal = item.price * item.quantity;
        message += `*${item.quantity}x* ${item.name} = ${itemSubtotal.toFixed(2)}$\n`;
    }

    message += "\n----------------------------------\n";
    
    // 2. Información de Delivery
    if (isDelivery) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
        
        if (distanceKm > 0) {
            const deliveryCost = finalTotal - subtotal;
            
            message += `✅ *SERVICIO:* DELIVERY 🚚\n`;
            message += `📍 *DISTANCIA CALCULADA:* ${distanceKm.toFixed(2)} km\n`;
            message += `💵 *COSTO DELIVERY:* ${deliveryCost.toFixed(2)}$ (1$/km, mínimo 1$)\n`;
            message += `\n*SUBTOTAL (Comida):* ${subtotal.toFixed(2)}$\n`;
            message += `*TOTAL FINAL:* ${finalTotal.toFixed(2)}$\n`;
            message += `🗺️ *UBICACIÓN CLIENTE:* ${mapsUrl}\n`;
            
        } else {
            message += `❌ *SERVICIO:* DELIVERY (FALLIDO) 🚚\n`;
            message += `⚠️ *ATENCIÓN:* No se pudo obtener la ubicación o fue rechazada. El costo de delivery se calculará a la entrega.\n`;
            message += `\n*TOTAL A PAGAR (Comida):* ${subtotal.toFixed(2)}$\n`;
        }
    } else {
        message += `✅ *SERVICIO:* RETIRO EN TIENDA 🚶\n`;
        message += `💰 *TOTAL A PAGAR:* ${subtotal.toFixed(2)}$\n`;
    }
    
    message += "----------------------------------\n";
    message += "\nPor favor, indique su nombre y dirección exacta.";

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${MENU_DATA.info.whatsapp_number}?text=${encodedMessage}`;

    // 3. Abrir WhatsApp y Guardar la Data
    window.open(whatsappUrl, '_blank');
    
    // *** GUARDAR EL PEDIDO EN LOCALSTORAGE ANTES DE VACIAR ***
    localStorage.setItem('lastOrderCart', JSON.stringify(cart));
    localStorage.setItem('lastOrderTime', Date.now());

    // 4. VACIAR Y REFRESCAR
    cart = {};
    updateCartDisplay();
}

function checkAndSendOrder() {
    const isDelivery = document.getElementById('delivery-checkbox').checked;
    const checkoutBtn = document.getElementById('checkout-btn');
    
    if (!MENU_DATA) {
         alert("Error: El menú no se ha cargado correctamente.");
         return;
    }

    // 1. VERIFICACIÓN DEL LÍMITE DE TIEMPO
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        return;
    }
    
    let subtotal = 0;
    for (const id in cart) {
        subtotal += cart[id].price * cart[id].quantity;
    }

    if (Object.keys(cart).length === 0) {
        alert("Por favor, agregue al menos un artículo al carrito antes de hacer el pedido.");
        return;
    }

    if (!isDelivery) {
        sendOrder(subtotal, subtotal, 0, 0, 0); 
        return;
    }
    
    // Si es Delivery, intentamos obtener la ubicación y calcular
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Calculando envío...';
    document.getElementById('loading-location').style.display = 'block';


    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // Éxito: Ubicación obtenida
                const clientLat = position.coords.latitude;
                const clientLon = position.coords.longitude;
                
                const ORIGIN_LAT = MENU_DATA.info.origin_lat;
                const ORIGIN_LON = MENU_DATA.info.origin_lon;
                
                const distanceKm = calculateDistance(ORIGIN_LAT, ORIGIN_LON, clientLat, clientLon);
                
                const deliveryCost = Math.max(1.00, distanceKm * 1.00); 
                
                const finalTotal = subtotal + deliveryCost;

                checkoutBtn.textContent = 'Hacer Pedido';
                document.getElementById('loading-location').style.display = 'none';

                sendOrder(subtotal, finalTotal, distanceKm, clientLat, clientLon);
            },
            (error) => {
                // Error: Usuario no dio permiso o hay error
                console.error('Error de geolocalización:', error);
                
                checkoutBtn.textContent = 'Hacer Pedido (Envío Pendiente)';
                document.getElementById('loading-location').style.display = 'none';

                sendOrder(subtotal, subtotal, 0, 0, 0); // Envío pendiente
            }
        );
    } else {
        // Navegador no soporta Geolocalización
        console.error('Geolocalización no soportada.');
        
        checkoutBtn.textContent = 'Hacer Pedido (Envío Pendiente)';
        document.getElementById('loading-location').style.display = 'none';
        
        sendOrder(subtotal, subtotal, 0, 0, 0); // Envío pendiente
    }
}

document.addEventListener('DOMContentLoaded', loadMenuData);
