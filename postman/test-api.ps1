# Pruebas equivalentes de las colecciones Postman de FacturaExpress (proyecto Java)
# Ejecutadas contra la API REST Express en http://localhost:4000/api
# Adaptacion: Java usa formularios MVC + cookies/CSRF; Express usa JSON REST + Bearer JWT.

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$token = $null
$results = [System.Collections.Generic.List[object]]::new()

function Set-JsonHeaders {
    return @{ 'Content-Type' = 'application/json' }
}

function Add-AuthHeaders {
    param([hashtable]$headers)
    $h = @{}
    $headers.GetEnumerator() | ForEach-Object { $h[$_.Key] = $_.Value }
    if ($token) { $h['Authorization'] = "Bearer $token" }
    return $h
}

function Test-Case {
    param(
        [string]$name,
        [bool]$pass,
        [string]$detail = ''
    )
    $status = if ($pass) { 'PASS' } else { 'FAIL' }
    $results.Add([pscustomobject]@{ Name = $name; Status = $status; Detail = $detail })
    if ($pass) {
        Write-Output "[PASS] $name"
    } else {
        Write-Output "[FAIL] $name -> $detail"
    }
}

function Invoke-Json {
    param(
        [string]$method,
        [string]$path,
        $body = $null,
        [bool]$auth = $true
    )
    $params = @{ Uri = "$base$path"; Method = $method; Headers = (Add-AuthHeaders (Set-JsonHeaders)); TimeoutSec = 30; UseBasicParsing = $true }
    if ($null -ne $body) {
        $params.Body = ($body | ConvertTo-Json -Depth 10)
    }
    $resp = Invoke-WebRequest @params
    return $resp.Content | ConvertFrom-Json
}

# ============================================================
# 1. AUTENTICACION
# ============================================================
Write-Output '===== 1. AUTENTICACION ====='

# 1.1 Login - Exito (admin)
try {
    $r = Invoke-Json 'POST' '/auth/login' @{ nit = '900.123.456-7'; password = 'admin123' } -auth $false
    $token = $r.token
    Test-Case '1.1 Login exito (admin)' ($null -ne $token -and $r.usuario.rol -eq 'admin') "rol=$($r.usuario.rol)"
} catch {
    Test-Case '1.1 Login exito (admin)' $false $_.Exception.Message
}

# 1.2 Login - Fallo (credenciales invalidas)
try {
    Invoke-Json 'POST' '/auth/login' @{ nit = 'usuario_invalido'; password = 'clave_incorrecta' } -auth $false | Out-Null
    Test-Case '1.2 Login fallo (credenciales invalidas)' $false 'Se esperaba HTTP 401'
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test-Case '1.2 Login fallo (credenciales invalidas)' ($code -eq 401) "status=$code"
}

# 1.3 Obtener usuario autenticado (equivalente a token CSRF / sesion)
try {
    $r = Invoke-Json 'GET' '/auth/me'
    Test-Case '1.3 Obtener usuario autenticado (auth/me)' ($r.usuario.nit -eq '900.123.456-7') "usuario=$($r.usuario.nombre)"
} catch {
    Test-Case '1.3 Obtener usuario autenticado (auth/me)' $false $_.Exception.Message
}

# 1.4 Logout (equivalente: sesion JWT expirada o renovacion) -> auth/me sin token debe fallar
try {
    $params = @{ Uri = "$base/auth/me"; Method = 'GET'; Headers = (Set-JsonHeaders); TimeoutSec = 15; UseBasicParsing = $true }
    Invoke-WebRequest @params | Out-Null
    Test-Case '1.4 Sesion invalidada (sin token -> 401)' $false 'Se esperaba 401 sin token'
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test-Case '1.4 Sesion invalidada (sin token -> 401)' ($code -eq 401) "status=$code"
}

# ============================================================
# 2. DASHBOARD
# ============================================================
Write-Output '===== 2. DASHBOARD ====='
try {
    $k = Invoke-Json 'GET' '/reportes/kpis'
    Test-Case '2.1 Dashboard KPIs' ($null -ne $k.kpis -and $null -ne $k.kpis.ventasMes) "ventasMes=$($k.kpis.ventasMes)"
} catch { Test-Case '2.1 Dashboard KPIs' $false $_.Exception.Message }

try {
    $v = Invoke-Json 'GET' '/reportes/ventas-semanales'
    Test-Case '2.1b Ventas semanales' ($null -ne $v.ventas) "dias=$($v.ventas.Count)"
} catch { Test-Case '2.1b Ventas semanales' $false $_.Exception.Message }

try {
    $t = Invoke-Json 'GET' '/reportes/ultimas-transacciones'
    Test-Case '2.1c Ultimas transacciones' ($null -ne $t.transacciones) "n=$($t.transacciones.Count)"
} catch { Test-Case '2.1c Ultimas transacciones' $false $_.Exception.Message }

# ============================================================
# 3. CLIENTES (CRUD)
# ============================================================
Write-Output '===== 3. CLIENTES (CRUD) ====='
$nitTest = "901.123.456-$((Get-Random -Maximum 900))"
$clienteId = $null
try {
    $c = Invoke-Json 'GET' '/clientes'
    Test-Case '3.1 Listar clientes' ($null -ne $c.clientes) "total=$($c.total)"
} catch { Test-Case '3.1 Listar clientes' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'POST' '/clientes' @{ identificacion = $nitTest; nombre = 'Cliente Postman Test'; email = 'cliente_test@correo.com'; telefono = '3001234567' }
    $clienteId = $r.cliente.id
    Test-Case '3.3 Crear cliente' ($null -ne $clienteId) "id=$clienteId"
} catch { Test-Case '3.3 Crear cliente' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'PUT' "/clientes/$clienteId" @{ nombre = 'Cliente Actualizado Postman'; email = 'actualizado@correo.com'; telefono = '3109876543' }
    Test-Case '3.5 Actualizar cliente' ($r.cliente.nombre -eq 'Cliente Actualizado Postman') "nombre=$($r.cliente.nombre)"
} catch { Test-Case '3.5 Actualizar cliente' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'GET' "/clientes/$clienteId"
    Test-Case '3.4 Ver detalle cliente' ($r.cliente.id -eq $clienteId) "id=$($r.cliente.id)"
} catch { Test-Case '3.4 Ver detalle cliente' $false $_.Exception.Message }

try {
    Invoke-Json 'DELETE' '/clientes/999999' | Out-Null
    Test-Case '3.6 Eliminar cliente (ID inexistente -> 404)' $false 'Se esperaba HTTP 404'
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test-Case '3.6 Eliminar cliente (ID inexistente -> 404)' ($code -eq 404) "status=$code"
}

# ============================================================
# 4. PRODUCTOS (CRUD)
# ============================================================
Write-Output '===== 4. PRODUCTOS (CRUD) ====='
$productoId = $null
try {
    $p = Invoke-Json 'GET' '/productos'
    Test-Case '4.1 Listar productos' ($null -ne $p.productos) "total=$($p.total)"
} catch { Test-Case '4.1 Listar productos' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'POST' '/productos' @{ codigo = "PRD-TEST-$((Get-Random -Maximum 99999))"; nombre = 'Producto Test Postman'; precio = 25000; stock = 100 }
    $productoId = $r.producto.id
    Test-Case '4.2 Crear producto' ($null -ne $productoId) "id=$productoId"
} catch { Test-Case '4.2 Crear producto' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'PUT' "/productos/$productoId" @{ nombre = 'Producto Actualizado Postman'; precio = 35000 }
    Test-Case '4.3 Actualizar producto' ($r.producto.precio -eq 35000) "precio=$($r.producto.precio)"
} catch { Test-Case '4.3 Actualizar producto' $false $_.Exception.Message }

try {
    Invoke-Json 'DELETE' '/productos/999999' | Out-Null
    Test-Case '4.4 Eliminar producto (ID inexistente -> 404)' $false 'Se esperaba HTTP 404'
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test-Case '4.4 Eliminar producto (ID inexistente -> 404)' ($code -eq 404) "status=$code"
}

# ============================================================
# 5. FACTURAS
# ============================================================
Write-Output '===== 5. FACTURAS ====='
$facturaId = $null
try {
    $f = Invoke-Json 'GET' '/facturas?limite=5'
    Test-Case '5.1 Listar facturas' ($null -ne $f.facturas) "total=$($f.total)"
} catch { Test-Case '5.1 Listar facturas' $false $_.Exception.Message }

try {
    $body = @{ clienteId = 1; items = @(@{ productoId = 1; cantidad = 2 }); descuento = 10 }
    $r = Invoke-Json 'POST' '/facturas' $body
    $facturaId = $r.factura.id
    $expSubtotal = 2 * 85000
    $expDesc = [math]::Round($expSubtotal * 0.10)
    $expBase = $expSubtotal - $expDesc
    $expTotal = $expBase + [math]::Round($expBase * 0.19)
    Test-Case '5.3 Crear factura' ($null -ne $facturaId) "id=$facturaId"
    Test-Case '5.3b Total con descuento 10%' ($r.factura.total -eq $expTotal) "total=$($r.factura.total) esperado=$expTotal"
    Test-Case '5.3c CUNE generado' ($r.factura.cufe.Length -ge 40) "len=$($r.factura.cufe.Length)"
} catch { Test-Case '5.3 Crear factura' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'GET' "/facturas/$facturaId"
    Test-Case '5.4 Detalle factura' ($null -ne $r.factura.items -and $r.factura.items.Count -ge 1) "items=$($r.factura.items.Count)"
} catch { Test-Case '5.4 Detalle factura' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'PUT' "/facturas/$facturaId/estado" @{ estado = 'enviada' }
    Test-Case '5.5 Cambiar estado -> enviada' ($r.factura.estado -eq 'enviada') "estado=$($r.factura.estado)"
} catch { Test-Case '5.5 Cambiar estado -> enviada' $false $_.Exception.Message }

try {
    $resp = Invoke-WebRequest -Uri "$base/facturas/$facturaId/pdf" -Headers (Add-AuthHeaders @{}) -TimeoutSec 30 -UseBasicParsing
    Test-Case '5.5b Descargar PDF factura' ($resp.StatusCode -eq 200 -and $resp.Headers.'Content-Type' -match 'pdf') "ct=$($resp.Headers.'Content-Type')"
} catch { Test-Case '5.5b Descargar PDF factura' $false $_.Exception.Message }

try {
    $resp = Invoke-WebRequest -Uri "$base/facturas/$facturaId/xml" -Headers (Add-AuthHeaders @{}) -TimeoutSec 30 -UseBasicParsing
    $esXml = $resp.Content -match '<(Factura|Invoice|Documento)'
    Test-Case '5.5c Descargar XML factura' ($resp.StatusCode -eq 200 -and $esXml) "ct=$($resp.Headers.'Content-Type')"
} catch { Test-Case '5.5c Descargar XML factura' $false $_.Exception.Message }

try {
    Invoke-Json 'DELETE' '/facturas/999999' | Out-Null
    Test-Case '5.6 Eliminar factura (ID inexistente -> 404)' $false 'Se esperaba HTTP 404'
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test-Case '5.6 Eliminar factura (ID inexistente -> 404)' ($code -eq 404) "status=$code"
}

# ============================================================
# 6. VENTAS (POS) - con descuento porcentual
# ============================================================
Write-Output '===== 6. VENTAS (POS) ====='
try {
    $body = @{ clienteId = 1; items = @(@{ productoId = 1; cantidad = 3 }); descuento = 10 }
    $r = Invoke-Json 'POST' '/facturas' $body
    Test-Case '6.2 Finalizar venta POS con descuento 10%' ($null -ne $r.factura.id -and $r.factura.descuento -gt 0) "id=$($r.factura.id) descuento=$($r.factura.descuento)"
} catch { Test-Case '6.2 Finalizar venta POS con descuento 10%' $false $_.Exception.Message }

# ============================================================
# 7. REPORTES
# ============================================================
Write-Output '===== 7. REPORTES ====='
try {
    $r = Invoke-Json 'GET' '/reportes/ventas-periodo?periodo=mensual'
    Test-Case '7.1 Reporte ventas por periodo' ($null -ne $r.ventas) "n=$($r.ventas.Count)"
} catch { Test-Case '7.1 Reporte ventas por periodo' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'GET' '/reportes/productos-top?limite=5'
    Test-Case '7.1b Productos mas vendidos' ($null -ne $r.productos) "n=$($r.productos.Count)"
} catch { Test-Case '7.1b Productos mas vendidos' $false $_.Exception.Message }

try {
    $resp = Invoke-WebRequest -Uri "$base/reportes/pdf?periodo=mensual" -Headers (Add-AuthHeaders @{}) -TimeoutSec 60 -UseBasicParsing
    Test-Case '7.3 Exportar reporte PDF' ($resp.StatusCode -eq 200 -and $resp.Headers.'Content-Type' -match 'pdf') "ct=$($resp.Headers.'Content-Type')"
} catch { Test-Case '7.3 Exportar reporte PDF' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'GET' '/reportes/historial'
    Test-Case '7.4 Historial de reportes' ($null -ne $r.reportes) "n=$($r.reportes.Count)"
} catch { Test-Case '7.4 Historial de reportes' $false $_.Exception.Message }

# ============================================================
# 8. CONFIGURACION
# ============================================================
Write-Output '===== 8. CONFIGURACION ====='
try {
    $r = Invoke-Json 'GET' '/configuracion'
    Test-Case '8.1 Ver configuracion' ($null -ne $r.configuracion.empresa.nit) "nit=$($r.configuracion.empresa.nit)"
} catch { Test-Case '8.1 Ver configuracion' $false $_.Exception.Message }

try {
    $emp = (Invoke-Json 'GET' '/configuracion').configuracion.empresa
    $r = Invoke-Json 'PUT' '/configuracion/empresa' @{ nit = $emp.nit; razonSocial = $emp.razonSocial; emailFacturacion = $emp.emailFacturacion; telefono = $emp.telefono }
    Test-Case '8.2 Guardar configuracion empresa' ($r.success -eq $true) "success=$($r.success)"
} catch { Test-Case '8.2 Guardar configuracion empresa' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'POST' '/configuracion/dian/sync' @{}
    Test-Case '8.3 Sincronizar con DIAN' ($r.success -eq $true) "ultimaSync=$($r.fiscal.ultimaSync)"
} catch { Test-Case '8.3 Sincronizar con DIAN' $false $_.Exception.Message }

# ============================================================
# 9. USUARIOS (solo admin)
# ============================================================
Write-Output '===== 9. USUARIOS (Admin) ====='
$userId = $null
$nitUser = "903.654.321-$((Get-Random -Maximum 900))"
try {
    $r = Invoke-Json 'GET' '/usuarios'
    Test-Case '9.1 Listar usuarios' ($null -ne $r.usuarios) "total=$($r.total)"
} catch { Test-Case '9.1 Listar usuarios' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'POST' '/usuarios' @{ nit = $nitUser; nombre = 'Vendedor Test Postman'; email = "vendedor_test_$(Get-Random -Maximum 99999)@correo.com"; rol = 'vendedor'; password = 'Password123' }
    $userId = $r.usuario.id
    Test-Case '9.2 Crear usuario VENDEDOR' ($null -ne $userId -and $r.usuario.rol -eq 'vendedor') "id=$userId rol=$($r.usuario.rol)"
} catch { Test-Case '9.2 Crear usuario VENDEDOR' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'PUT' "/usuarios/$userId" @{ nombre = 'Vendedor Actualizado Postman'; email = "vendedor_act_$(Get-Random -Maximum 99999)@correo.com" }
    Test-Case '9.3 Actualizar usuario' ($r.usuario.nombre -eq 'Vendedor Actualizado Postman') "nombre=$($r.usuario.nombre)"
} catch { Test-Case '9.3 Actualizar usuario' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'PATCH' "/usuarios/$userId/activo" @{ activo = $false }
    Test-Case '9.4 Desactivar usuario' ($r.usuario.activo -eq $false) "activo=$($r.usuario.activo)"
    $r2 = Invoke-Json 'PATCH' "/usuarios/$userId/activo" @{ activo = $true }
    Test-Case '9.4b Reactivar usuario' ($r2.usuario.activo -eq $true) "activo=$($r2.usuario.activo)"
} catch { Test-Case '9.4 Toggle activo usuario' $false $_.Exception.Message }

try {
    Invoke-Json 'DELETE' '/usuarios/999999' | Out-Null
    Test-Case '9.5 Eliminar usuario (ID inexistente -> 404)' $false 'Se esperaba HTTP 404'
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test-Case '9.5 Eliminar usuario (ID inexistente -> 404)' ($code -eq 404) "status=$code"
}

# ============================================================
# 10. ERRORES DEL SISTEMA
# ============================================================
Write-Output '===== 10. ERRORES DEL SISTEMA ====='
try {
    $r = Invoke-Json 'GET' '/errores'
    Test-Case '10.1 Listar errores' ($null -ne $r.errores) "total=$($r.total) noResueltos=$($r.noResueltos)"
} catch { Test-Case '10.1 Listar errores' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'GET' '/errores?tipo=dian'
    Test-Case '10.2 Filtrar errores por tipo (dian)' ($null -ne $r.errores) "n=$($r.errores.Count)"
} catch { Test-Case '10.2 Filtrar errores por tipo (dian)' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'GET' '/errores?resuelto=false'
    if ($r.errores.Count -gt 0) {
        $id = $r.errores[0].id
        $r2 = Invoke-Json 'PATCH' "/errores/$id/resolver"
        Test-Case '10.3 Resolver error' ($r2.success -eq $true) "id=$id"
    } else {
        Test-Case '10.3 Resolver error' $true 'Sin errores pendientes por resolver'
    }
} catch { Test-Case '10.3 Resolver error' $false $_.Exception.Message }

# ============================================================
# 11. AUDITORIA
# ============================================================
Write-Output '===== 11. AUDITORIA ====='
try {
    $r = Invoke-Json 'GET' '/logs?limite=50'
    Test-Case '11.1 Ver logs de auditoria' ($null -ne $r.logs) "n=$($r.logs.Count) tablas=$($r.tablas.Count)"
} catch { Test-Case '11.1 Ver logs de auditoria' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'GET' '/logs?tabla=facturas'
    Test-Case '11.2 Filtrar logs por tabla (facturas)' ($null -ne $r.logs) "n=$($r.logs.Count)"
} catch { Test-Case '11.2 Filtrar logs por tabla (facturas)' $false $_.Exception.Message }

# ============================================================
# 12. BACKUP Y RESTAURACION
# ============================================================
Write-Output '===== 12. BACKUP Y RESTAURACION ====='
$backupFile = $null
try {
    $r = Invoke-Json 'GET' '/backup'
    Test-Case '12.1 Ver lista de backups' ($null -ne $r.backups) "n=$($r.backups.Count)"
} catch { Test-Case '12.1 Ver lista de backups' $false $_.Exception.Message }

try {
    $r = Invoke-Json 'POST' '/backup' @{}
    Test-Case '12.2 Crear backup' ($r.success -eq $true) "archivo=$($r.backup.archivo)"
    $backupFile = $r.backup.archivo
} catch { Test-Case '12.2 Crear backup' $false $_.Exception.Message }

if ($backupFile) {
    try {
        $resp = Invoke-WebRequest -Uri "$base/backup/$([uri]::EscapeDataString($backupFile))/download" -Headers (Add-AuthHeaders @{}) -TimeoutSec 60 -UseBasicParsing
        Test-Case '12.3 Descargar backup' ($resp.StatusCode -eq 200) "bytes=$($resp.RawContentLength)"
    } catch { Test-Case '12.3 Descargar backup' $false $_.Exception.Message }

    try {
        $r = Invoke-Json 'POST' '/backup/restaurar' @{ archivo = $backupFile }
        Test-Case '12.4 Restaurar backup' ($r.success -eq $true) "message=$($r.message)"
    } catch { Test-Case '12.4 Restaurar backup' $false $_.Exception.Message }

    try {
        $r = Invoke-Json 'DELETE' "/backup/$([uri]::EscapeDataString($backupFile))"
        Test-Case '12.5 Eliminar backup' ($r.success -eq $true) "message=$($r.message)"
    } catch { Test-Case '12.5 Eliminar backup' $false $_.Exception.Message }
}

# ============================================================
# RESUMEN
# ============================================================
Write-Output ''
Write-Output '===== RESUMEN ====='
$passed = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
$failed = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Output "TOTAL: $($results.Count) | PASS: $passed | FAIL: $failed"
if ($failed -gt 0) {
    Write-Output ''
    Write-Output '---- FALLIDOS ----'
    $results | Where-Object { $_.Status -eq 'FAIL' } | ForEach-Object { Write-Output "  $($_.Name): $($_.Detail)" }
    exit 1
} else {
    exit 0
}
